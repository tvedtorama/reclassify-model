import { Maybe, Some } from "monet"
import {Subject, combineLatest, interval} from 'rxjs'
import {map, scan, filter, mergeMap, withLatestFrom} from 'rxjs/operators/index'
import { MobileNet } from "@tensorflow-models/mobilenet"
import { createImageNetCore } from "./imageNetCore"

export interface IResult {
	timeout: number,
	data: {className: string, probability: number}
	polygon: {x: number, y: number}[]
}

type IResultOptions = IResult | false

interface IPrelimResult {
	code: {location: any}
	className: string
	probability: number
	matchTime: number
}
interface IMatchStats {firstMatch: number, lastMatch: number, match: IPrelimResult | null}

const timeoutSeconds = 5
const lostHitUseLastTimeout = 500
/** Minimum probability for considering the item a hit */
const probabilityThreshold = 0.38

/* Used as accumulator with scan to keep matches a short while after the algorithm ceases to see the code. This is useful to with a countdown. */
export const keepLastHitWhenCloseInTime = (timeout: number, rightNow = () => +new Date()) =>
	(acc: IMatchStats, matchMaybe: Maybe<IPrelimResult>) => matchMaybe
	.map(match => ({
		firstMatch: acc.match?.className === match?.className && acc.firstMatch > 0 ? acc.firstMatch : match.matchTime,
		lastMatch: match.matchTime,
		match: <IPrelimResult | null>match,
	}))
	.catchMap((now = rightNow()) => acc.lastMatch > now - timeout ?
		Maybe.Some(acc) : Maybe.some({firstMatch: -1, lastMatch: -1, match: null}))
	.some()

interface IClassifyResult {className: string, probability: number}

const pickResults = (res: IClassifyResult[]) => {
//	console.log(res)
//  Absolutely impossible to get chrome to break on this.  Moved to separate function, added brackets - no luck....  Helps to re-open the dev panel.
	return 	Maybe.fromFalsy(res.length && res[0].probability > probabilityThreshold && res[0])
}

export interface IClassifierCore {
	classify: (imageData: ImageData) => Promise<IClassifyResult[]>
	addExample: (imageData: ImageData, classCode: number) => void
}

export const createClassifier = (mobileNet: MobileNet, onResults: (result: IResultOptions) => void, core = () => createImageNetCore(mobileNet)) =>
	Some({subject$: new Subject<ImageData>(), examples$: new Subject<number>(), core: core()})
	.map(({subject$, examples$, core}) => ({
		subject$,
		examples$,
		parses$: combineLatest(subject$.pipe(
				mergeMap(async imageData => Some(await core.classify(imageData))
					.flatMap(pickResults)
					.map(code => ({code}))
					.map(({code}) => <IPrelimResult>{
						code: {location: {
							topLeftCorner: {x: 0, y: 0},
							topRightCorner: {x: 640, y: 0},
							bottomLeftCorner: {x: 0, y: 480},
							bottomRightCorner: {x: 640, y: 480},
						}},
						...code, // class and prob
						matchTime: +new Date(),
					})
				),
				scan(keepLastHitWhenCloseInTime(lostHitUseLastTimeout), {firstMatch: -1, lastMatch: -1, match: <IPrelimResult | null>null})
			),
			interval(200)
		).pipe(
			map(([a, _t]) => a.firstMatch > 0 ? {...a, timeout: Math.max(0, Math.round((a.firstMatch + timeoutSeconds * 1000 - +new Date()) / 1000))} : {...a, timeout: -1}),
			scan<IMatchStats & {timeout: number} & {duplicate?: boolean}>((acc, val) => ({...val, duplicate: acc.timeout === val.timeout})),
			filter(val => !val.duplicate)
		),
		exampleProcessing$: examples$
			.pipe(
				withLatestFrom(subject$),
				map(([example, frame]) => core.addExample(frame, example)))
	}))
	.map(({subject$, examples$, ...rest}) => ({
		readerInterface: {
			addFrame: (imageData: ImageData) => subject$.next(imageData),
			addExample: (classCode: number) => examples$.next(classCode),
		},
		...rest
	}))
	.map(({parses$, readerInterface, exampleProcessing$}) => {
		const subscription = parses$.subscribe(({match, timeout}) => match ?
			(({code, className, probability}: IPrelimResult) => onResults({
				timeout,
				data: {className, probability},
				polygon: [
					code.location.topLeftCorner,
					code.location.topRightCorner,
					code.location.bottomRightCorner,
					code.location.bottomLeftCorner,
				]}))(match) : onResults(false)
		)
		const exampleSubscription = exampleProcessing$.subscribe(() => {})
		return {
			...readerInterface,
			unsubscribe: () => {
				subscription.unsubscribe()
				exampleSubscription.unsubscribe()
			}
		}
	})
.some()