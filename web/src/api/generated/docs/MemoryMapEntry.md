
# MemoryMapEntry


## Properties

Name | Type
------------ | -------------
`happenedOn` | Date
`latitude` | number
`longitude` | number
`memoryId` | string
`placeId` | string
`placeName` | string
`title` | string

## Example

```typescript
import type { MemoryMapEntry } from ''

// TODO: Update the object below with actual values
const example = {
  "happenedOn": null,
  "latitude": null,
  "longitude": null,
  "memoryId": null,
  "placeId": null,
  "placeName": null,
  "title": null,
} satisfies MemoryMapEntry

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as MemoryMapEntry
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


