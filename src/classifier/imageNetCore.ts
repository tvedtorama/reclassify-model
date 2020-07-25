import { IClassifierCore } from "./reader";
import { MobileNet } from "@tensorflow-models/mobilenet";

export const createImageNetCore = (model: MobileNet): IClassifierCore => ({
	addExample: () => {console.error("Training not supported, already modelled")},
	classify: (img) => model.classify(img)
})
