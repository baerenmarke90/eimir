
# GameMemoryCandidate

Minimal authorized Memory context required by `Unsere Momente`.

## Properties

Name | Type
------------ | -------------
`effectiveDate` | Date
`imageAttachmentId` | string
`memoryId` | string
`title` | string

## Example

```typescript
import type { GameMemoryCandidate } from ''

// TODO: Update the object below with actual values
const example = {
  "effectiveDate": null,
  "imageAttachmentId": null,
  "memoryId": null,
  "title": null,
} satisfies GameMemoryCandidate

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as GameMemoryCandidate
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


