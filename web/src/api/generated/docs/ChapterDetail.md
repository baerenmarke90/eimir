
# ChapterDetail


## Properties

Name | Type
------------ | -------------
`capabilities` | [ResourceCapabilities](ResourceCapabilities.md)
`createdAt` | Date
`createdBy` | string
`creator` | [AuthorSummary](AuthorSummary.md)
`description` | string
`endOn` | Date
`id` | string
`placeId` | string
`spaceId` | string
`startOn` | Date
`title` | string
`updatedAt` | Date
`version` | number

## Example

```typescript
import type { ChapterDetail } from ''

// TODO: Update the object below with actual values
const example = {
  "capabilities": null,
  "createdAt": null,
  "createdBy": null,
  "creator": null,
  "description": null,
  "endOn": null,
  "id": null,
  "placeId": null,
  "spaceId": null,
  "startOn": null,
  "title": null,
  "updatedAt": null,
  "version": null,
} satisfies ChapterDetail

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as ChapterDetail
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


