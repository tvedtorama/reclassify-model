import { MobileNet } from "@tensorflow-models/mobilenet"
import { create as createKNNClassifier } from "@tensorflow-models/knn-classifier"
import { IClassifierCore } from "./reader"
import { Some } from "monet"

export const createCustomClassifierCore = (model: MobileNet, classNames: {[index: string]: string}): IClassifierCore =>
	Some({knn: createKNNClassifier()})
	.map(({knn}) => (<IClassifierCore>{
		addExample: (img, classCode) => {
			const infer = model.infer(img, true)
			knn.addExample(infer, classCode)
			console.log(`Added example, ${classCode}`, infer.print())
		},
		classify: async (img) => [await knn.predictClass(model.infer(img, true)).catch(err => ({
				label: "0",
				confidences: <{[s: string]: number}>{
					"0": 0
				}
			}))]
			.map(({label, confidences}) => {
				// console.log(confidences)
				return ({
					className: classNames[label],
					probability: confidences[label],
				})
			}),
	})).some()
