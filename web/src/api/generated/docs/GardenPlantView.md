
# GardenPlantView


## Properties

Name | Type
------------ | -------------
`id` | string
`inPond` | boolean
`senderId` | string
`sentOn` | Date
`slot` | number
`species` | [GardenSpecies](GardenSpecies.md)
`stage` | number
`words` | [GardenWords](GardenWords.md)

## Example

```typescript
import type { GardenPlantView } from ''

// TODO: Update the object below with actual values
const example = {
  "id": null,
  "inPond": null,
  "senderId": null,
  "sentOn": null,
  "slot": null,
  "species": null,
  "stage": null,
  "words": null,
} satisfies GardenPlantView

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as GardenPlantView
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


