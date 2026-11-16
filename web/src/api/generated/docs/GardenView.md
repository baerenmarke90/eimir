
# GardenView


## Properties

Name | Type
------------ | -------------
`incoming` | [GardenPlantView](GardenPlantView.md)
`localDate` | Date
`offer` | [Array&lt;GardenSpecies&gt;](GardenSpecies.md)
`partnerSentToday` | boolean
`partnerWateredToday` | string
`plants` | [Array&lt;GardenPlantView&gt;](GardenPlantView.md)
`reunionOn` | Date
`reunionToday` | boolean
`sentToday` | [GardenPlantView](GardenPlantView.md)
`sharedToday` | boolean
`sleeping` | boolean
`wateredToday` | string

## Example

```typescript
import type { GardenView } from ''

// TODO: Update the object below with actual values
const example = {
  "incoming": null,
  "localDate": null,
  "offer": null,
  "partnerSentToday": null,
  "partnerWateredToday": null,
  "plants": null,
  "reunionOn": null,
  "reunionToday": null,
  "sentToday": null,
  "sharedToday": null,
  "sleeping": null,
  "wateredToday": null,
} satisfies GardenView

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as GardenView
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


