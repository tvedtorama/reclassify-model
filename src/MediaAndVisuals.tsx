import React, { useState, useRef, useMemo, useEffect } from "react"
import {useHistory} from 'react-router-dom'
import * as H from 'history';
import {Some, Maybe} from "monet"
import { createClassifier, IResult } from "./classifier/reader"
import mockImageSuccess from './mockImages/success.jpg';
import mockImageFailure from './mockImages/failure.jpg';
import { EventEmitter } from "events";
import { load as loadMobileNet, MobileNet } from "@tensorflow-models/mobilenet";

type ICanvasState = {width: number, height: number}

/* Disable rules of hooks as effects is placed in monads.  exhaustive deps as useEffect is made to run only once with the empty dep list */
/* eslint-disable react-hooks/rules-of-hooks, react-hooks/exhaustive-deps */

const mediaReady = (mediaElm: HTMLVideoElement | HTMLImageElement) =>
	"readyState" in mediaElm ?
		mediaElm.readyState === mediaElm.HAVE_ENOUGH_DATA :
		mediaElm.complete && mediaElm.naturalWidth > 0

const renderImages = (refs: React.RefObject<HTMLImageElement>[], imgs: string[]) =>
	imgs.map((src, i) => <img src={src} ref={refs[i]} key={i} style={{display: "none"}} alt={""} />)

const polygonPath = (polygon: {x: number, y: number}[]) =>
	"M" + [...polygon, polygon[0]].map(({x, y}) => `${x},${y} `).join()

const redirectToConfirm = (history: H.History<H.History.PoorMansUnknown>) => (r: IResult, ) =>
	history.push(`../confirm/${r.data.customer}/${r.data.fraction}/test_room/`)

const handleSetStateAndTimeoutRedirect = (setDataState: (s: IResult | false) => void, history: H.History<H.History.PoorMansUnknown>) =>
	(s: IResult | false) => 
		Maybe.fromFalsy(s || null)
			.filter(r => r.timeout === 0)
			.cata(() => setDataState(s), /* redirectToConfirm(history) */ (console.log("redirect!"), () => undefined))
	
export const MediaAndVisuals = ({useMockImage}: {useMockImage: boolean}) => Some({
		stateThings: useState<"INIT" | "WAIT" | "FAILED" | "STREAMING">("INIT"),
		dataState: useState<IResult | false>(false),
		videoRef: useRef<HTMLVideoElement>(null),
		canvasRef: useRef<HTMLCanvasElement>(null),
		mockStatePair: useState(Math.floor(Math.random() * 1.99)),
		imageRefs: [useRef<HTMLImageElement>(null), useRef<HTMLImageElement>(null)],
		browserHistory: useHistory(),
		mobileNet: useState<MobileNet | null>(null),
		mobileNetLoadPromise: useMemo(loadMobileNet, []),
		canvasEvents: useMemo(() => new EventEmitter(), []),
	}).map(({dataState: [dataState, setDataState], browserHistory, mobileNet, ...rest}) => ({
		classifier: useMemo(() => mobileNet[0] ? createClassifier(mobileNet[0], handleSetStateAndTimeoutRedirect(setDataState, browserHistory)) : null, [mobileNet[0]]),
		redirectToConfirm: redirectToConfirm(browserHistory),
		loadHookEffect: useEffect(() => {
			rest.mobileNetLoadPromise.then((net) => {
//				rest.stateThings[1]("LOADED")
				mobileNet[1](net)
			})}, []),
		dataState,
		...rest,
	})).map(({videoRef, canvasRef, imageRefs, mockStatePair: [mockState], classifier, canvasEvents, ...rest}) => ({
		registerMediaStreamAndAnimSeq: useEffect(() => {
			if (!classifier) {
				// This ugliness is here as we load the model first (wait for classifier), then hook up the animate sequence.  Could have separate process that waits for video init and model init and then sets up animation.
				return undefined
			}
			if (videoRef.current == null || canvasRef.current == null) {
				throw new Error("This handling is here because of strict mode, the variable defs below as well")
			}
			const videoElm = videoRef.current
			const canvasElm = canvasRef.current
			let animRequest = 0
			const reqAnim = () => animRequest = requestAnimationFrame(animate)
			const animate = () => {
				const mediaSource = useMockImage ? imageRefs[mockState].current || videoElm : videoElm
				if (mediaReady(mediaSource)) {
					Maybe.fromFalsy(canvasElm.getContext("2d"))
						.forEach(ctx => {
							ctx.drawImage(mediaSource, 0, 0, canvasElm.width, canvasElm.height);
							classifier.addFrame(ctx.getImageData(0, 0, canvasElm.width, canvasElm.height))
							ctx.lineWidth = 3
							ctx.lineCap = "round"
							ctx.strokeStyle = "rgb(255, 0, 0, 0.5)"
							canvasEvents.emit("ctx", ctx)
						})
				}
				reqAnim()
			}
			rest.stateThings[1]("WAIT")
			Promise.resolve(true).then(() =>
				(useMockImage ? Promise.resolve(true) : navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } }).then(function(stream) {
					videoElm.srcObject = stream;
					videoElm.setAttribute("playsinline", "true"); // required to tell iOS safari we don't want fullscreen
					videoElm.play();
					return true
				})).then(() => {
					reqAnim()
					rest.stateThings[1]("STREAMING")
				})).catch(err => {
					rest.stateThings[1]("FAILED")
				})
		  
			return () => (animRequest && (cancelAnimationFrame(animRequest), undefined)) || undefined;
		  }, [classifier]),
		unsubscribe: useEffect(() => () => classifier && classifier.unsubscribe(), []),
		paintPolygon: useEffect(() => Maybe.fromFalsy((ctx: CanvasRenderingContext2D) => {
				if (!(rest.dataState && rest.dataState.polygon?.length))
					return
				const polygon = rest.dataState.polygon
				// console.log(pathSpec)
				const path = new Path2D(polygonPath(polygon))
				ctx.stroke(path)
			})
			.map(onCanvasFunc => {
				canvasEvents.on("ctx", onCanvasFunc)
				return () => {canvasEvents.removeListener("ctx", onCanvasFunc)}
			})
			.some(), [rest.dataState && polygonPath(rest.dataState.polygon)]),
		...rest,
		videoRef,
		canvasRef,
		imageRefs
	}))
	.map(({stateThings: [state], videoRef, imageRefs, canvasRef, dataState, redirectToConfirm}) => 
		state === "FAILED" ?
			<div style={{color: "orange", margin: "2em"}}><span role={"img"} aria-label="video-issue">🎥</span> Unable to access video stream (please make sure you have a webcam enabled)</div> :
			<div style={{display: "flex", flexDirection: "column"}}>
				<video ref={videoRef} style={{display: "none"}} />
				{useMockImage && renderImages(imageRefs, [mockImageSuccess, mockImageFailure])}
				{ /* Insane error here: used style (CSS) width/height, instead of plain w/h.  This led to some crazy scaling that was impossible to understand.  Look up "300x150" for an explanation. 
					Note: Assumes 640x480 is same aspect as video stream, if this assumption fails, the result will be stretched */ }
				<canvas ref={canvasRef} width={`${640}px`} height={`${480}px`} />
				{dataState && [
					<span key="s">Customer: {dataState.data.customer}, Fraction: {dataState.data.fraction}</span>,
					<button key="a" onClick={() => redirectToConfirm(dataState)} style={{margin: "auto", marginTop: "1em"}}>Use ({dataState.timeout}s)</button>
				]}
			</div>).some()