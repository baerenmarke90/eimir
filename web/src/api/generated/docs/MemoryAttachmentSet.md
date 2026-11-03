
# MemoryAttachmentSet


## Properties

Name | Type
------------ | -------------
`attachments` | [Array&lt;MemoryAttachmentEntry&gt;](MemoryAttachmentEntry.md)
`selectedCoverAttachmentId` | string

## Example

```typescript
import type { MemoryAttachmentSet } from ''

// TODO: Update the object below with actual values
const example = {
  "attachments": null,
  "selectedCoverAttachmentId": null,
} satisfies MemoryAttachmentSet

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as MemoryAttachmentSet
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


