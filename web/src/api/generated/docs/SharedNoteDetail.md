
# SharedNoteDetail


## Properties

Name | Type
------------ | -------------
`body` | string
`capabilities` | [ResourceCapabilities](ResourceCapabilities.md)
`createdAt` | Date
`createdBy` | string
`creator` | [AuthorSummary](AuthorSummary.md)
`editedAt` | Date
`editedBy` | string
`editor` | [AuthorSummary](AuthorSummary.md)
`id` | string
`pinned` | boolean
`spaceId` | string
`title` | string
`version` | number
`wirTitleOnly` | boolean

## Example

```typescript
import type { SharedNoteDetail } from ''

// TODO: Update the object below with actual values
const example = {
  "body": null,
  "capabilities": null,
  "createdAt": null,
  "createdBy": null,
  "creator": null,
  "editedAt": null,
  "editedBy": null,
  "editor": null,
  "id": null,
  "pinned": null,
  "spaceId": null,
  "title": null,
  "version": null,
  "wirTitleOnly": null,
} satisfies SharedNoteDetail

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as SharedNoteDetail
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


