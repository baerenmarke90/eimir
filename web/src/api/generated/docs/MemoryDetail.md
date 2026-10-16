
# MemoryDetail


## Properties

Name | Type
------------ | -------------
`attachments` | [Array&lt;MemoryAttachmentSummary&gt;](MemoryAttachmentSummary.md)
`author` | [AuthorSummary](AuthorSummary.md)
`authorId` | string
`body` | string
`capabilities` | [ResourceCapabilities](ResourceCapabilities.md)
`createdAt` | Date
`happenedOn` | Date
`id` | string
`spaceId` | string
`tags` | Array&lt;string&gt;
`title` | string
`updatedAt` | Date
`version` | number

## Example

```typescript
import type { MemoryDetail } from ''

// TODO: Update the object below with actual values
const example = {
  "attachments": null,
  "author": null,
  "authorId": null,
  "body": null,
  "capabilities": null,
  "createdAt": null,
  "happenedOn": null,
  "id": null,
  "spaceId": null,
  "tags": null,
  "title": null,
  "updatedAt": null,
  "version": null,
} satisfies MemoryDetail

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as MemoryDetail
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


