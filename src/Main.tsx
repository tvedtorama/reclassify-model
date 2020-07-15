import React, { useState, useMemo, useEffect } from 'react';
import {Some} from 'monet'
import {load, MobileNet} from "@tensorflow-models/mobilenet"

/* eslint-disable react-hooks/rules-of-hooks */
/* eslint-disable react-hooks/exhaustive-deps */

const loadMobileNet = () => load()

export const Main = () =>
	Some({
		modelState: useState<"LOADING" | "FAILED" | "LOADED">("LOADING"),
		mobileNet: useState<MobileNet | null>(null),
		mobileNetLoadPromise: useMemo(loadMobileNet, [])
	})
	.map(({
		mobileNetLoadPromise,
		...rest}) => ({
			loadHookEffect: useEffect(() => {
				mobileNetLoadPromise.then((net) => {
					rest.modelState[1]("LOADED")
					rest.mobileNet[1](net)
				})
			}, []),
			...rest
		})) 
	.map(({modelState: [state]}) =>
		<div>This is main! {state}</div>)
	.some()
