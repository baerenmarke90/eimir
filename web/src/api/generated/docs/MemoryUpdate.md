
# MemoryUpdate


## Properties

Name | Type
------------ | -------------
`body` | string
`expectedPlaceIds` | Array&lt;string&gt;
`happenedOn` | Date
`happenedUntil` | Date
`placeIds` | Array&lt;string&gt;
`tags` | Array&lt;string&gt;
`title` | string

## Example

```typescript
import type { MemoryUpdate } from ''

// TODO: Update the object below with actual values
const example = {
  "body": null,
  "expectedPlaceIds": null,
  "happenedOn": null,
  "happenedUntil": null,
  "placeIds": null,
  "tags": null,
  "title": null,
} satisfies MemoryUpdate

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as MemoryUpdate
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


