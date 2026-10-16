
# MemorySummary

Memory projection used as a timeline card.  The body is intentionally omitted: the card needs a heading and images, while returning one hundred full texts would produce data nobody requested. The body remains available on the detail route.

## Properties

Name | Type
------------ | -------------
`attachments` | [Array&lt;MemoryAttachmentSummary&gt;](MemoryAttachmentSummary.md)
`author` | [AuthorSummary](AuthorSummary.md)
`capabilities` | [ResourceCapabilities](ResourceCapabilities.md)
`createdAt` | Date
`happenedOn` | Date
`id` | string
`title` | string

## Example

```typescript
import type { MemorySummary } from ''

// TODO: Update the object below with actual values
const example = {
  "attachments": null,
  "author": null,
  "capabilities": null,
  "createdAt": null,
  "happenedOn": null,
  "id": null,
  "title": null,
} satisfies MemorySummary

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as MemorySummary
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


