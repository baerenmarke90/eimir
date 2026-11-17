
# GardenView


## Properties

Name | Type
------------ | -------------
`bouquet` | [GardenBouquetView](GardenBouquetView.md)
`discovered` | [Array&lt;GardenSpecies&gt;](GardenSpecies.md)
`form` | [GardenForm](GardenForm.md)
`gaveBouquetToday` | boolean
`incoming` | [GardenPlantView](GardenPlantView.md)
`localDate` | Date
`name` | string
`news` | [Array&lt;GardenUnlock&gt;](GardenUnlock.md)
`offer` | [Array&lt;GardenSpecies&gt;](GardenSpecies.md)
`partnerSentToday` | boolean
`partnerWateredToday` | string
`plants` | [Array&lt;GardenPlantView&gt;](GardenPlantView.md)
`reunionOn` | Date
`reunionToday` | boolean
`sentToday` | [GardenPlantView](GardenPlantView.md)
`sharedDays` | number
`sharedToday` | boolean
`sleeping` | boolean
`unlocks` | [Array&lt;GardenUnlock&gt;](GardenUnlock.md)
`wateredToday` | string

## Example

```typescript
import type { GardenView } from ''

// TODO: Update the object below with actual values
const example = {
  "bouquet": null,
  "discovered": null,
  "form": null,
  "gaveBouquetToday": null,
  "incoming": null,
  "localDate": null,
  "name": null,
  "news": null,
  "offer": null,
  "partnerSentToday": null,
  "partnerWateredToday": null,
  "plants": null,
  "reunionOn": null,
  "reunionToday": null,
  "sentToday": null,
  "sharedDays": null,
  "sharedToday": null,
  "sleeping": null,
  "unlocks": null,
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


