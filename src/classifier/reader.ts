import { Maybe, Some } from "monet"
import {Subject, combineLatest, interval} from 'rxjs'
import {map, scan, filter, mergeMap} from 'rxjs/operators/index'
import { MobileNet } from "@tensorflow-models/mobilenet"

export interface IResult {
	timeout: number,
	data: {customer: string, fraction: string}
	polygon: {x: number, y: number}[]
}

type IResultOptions = IResult | false

interface IPrelimResult {
	code: {location: any}
	customer: string
	fraction: string
	matchTime: number
}
interface IMatchStats {firstMatch: number, lastMatch: number, match: IPrelimResult | null}

const timeoutSeconds = 5

/* Used as accumulator with scan to keep matches a short while after the algorithm ceases to see the code. This is useful to with a countdown. */
export const keepLastHitWhenCloseInTime = (timeout: number, rightNow = () => +new Date()) =>
	(acc: IMatchStats, matchMaybe: Maybe<IPrelimResult>) => matchMaybe
	.map(match => ({
		firstMatch: acc.match?.customer === match?.customer && acc.firstMatch > 0 ? acc.firstMatch : match.matchTime,
		lastMatch: match.matchTime,
		match: <IPrelimResult | null>match,
	}))
	.catchMap((now = rightNow()) => acc.lastMatch > now - timeout ?
		Maybe.Some(acc) : Maybe.some({firstMatch: -1, lastMatch: -1, match: null}))
	.some()

const pickResults = (res: {className: string, probability: number}[]) => {
//	console.log(res)
//  Absolutely impossible to get chrome to break on this.  Moved to separate function, added brackets - no luck....  Helps to re-open the dev panel.
	return 	Maybe.fromFalsy(res.length && res[0])
}

export const createClassifier = (mobileNet: MobileNet, onResults: (result: IResultOptions) => void) =>
	Some(new Subject<ImageData>())
	.map(subject$ => ({
		subject$,
		parses$: combineLatest([subject$.pipe(
				mergeMap(async imageData => Some(await mobileNet.classify(imageData))
					.flatMap(pickResults)
					.map(code => ({code}))
/*					.flatMap(({code, regex}) => Maybe.fromFalsy(regex)
						.map(regex => ({code, regex}))) */
					.map(({code}) => <IPrelimResult>{
						code: {location: {
							topLeftCorner: {x: 0, y: 0},
							topRightCorner: {x: 640, y: 0},
							bottomLeftCorner: {x: 0, y: 480},
							bottomRightCorner: {x: 640, y: 480},
						}},
						customer: code.className,
						fraction: null,
						matchTime: +new Date(),
					})
				),
				scan(keepLastHitWhenCloseInTime(500), {firstMatch: -1, lastMatch: -1, match: <IPrelimResult | null>null})
			),
			interval(200)
		]).pipe(
			map(([a, _t]) => a.firstMatch > 0 ? {...a, timeout: Math.max(0, Math.round((a.firstMatch + timeoutSeconds * 1000 - +new Date()) / 1000))} : {...a, timeout: -1}),
			scan<IMatchStats & {timeout: number} & {duplicate?: boolean}>((acc, val) => ({...val, duplicate: acc.timeout === val.timeout})),
			filter(val => !val.duplicate)
		)
	}))
	.map(({subject$, parses$}) => ({
		readerInterface: {
			addFrame: (imageData: ImageData) => subject$.next(imageData)
		},
		parses$
	}))
	.map(({parses$, readerInterface}) => {
		const subscription = parses$.subscribe(({match, timeout}) => match ?
			(({code, customer, fraction}: IPrelimResult) => onResults({
				timeout,
				data: {customer, fraction},
				polygon: [
					code.location.topLeftCorner,
					code.location.topRightCorner,
					code.location.bottomRightCorner,
					code.location.bottomLeftCorner,
				]}))(match) : onResults(false)
		)
		return {
			...readerInterface,
			unsubscribe: () => subscription.unsubscribe()
		}
	})
.some()