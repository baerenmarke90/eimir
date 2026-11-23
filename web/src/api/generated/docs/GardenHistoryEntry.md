
# GardenHistoryEntry


## Properties

Name | Type
------------ | -------------
`actorId` | string
`flowers` | [Array&lt;GardenBouquetFlower&gt;](GardenBouquetFlower.md)
`happenedOn` | Date
`key` | string
`kind` | [GardenHistoryKind](GardenHistoryKind.md)
`senderId` | string
`species` | [GardenSpecies](GardenSpecies.md)
`waiting` | boolean
`words` | [GardenWords](GardenWords.md)

## Example

```typescript
import type { GardenHistoryEntry } from ''

// TODO: Update the object below with actual values
const example = {
  "actorId": null,
  "flowers": null,
  "happenedOn": null,
  "key": null,
  "kind": null,
  "senderId": null,
  "species": null,
  "waiting": null,
  "words": null,
} satisfies GardenHistoryEntry

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as GardenHistoryEntry
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


