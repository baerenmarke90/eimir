
# CollectionItemDetail


## Properties

Name | Type
------------ | -------------
`capabilities` | [ResourceCapabilities](ResourceCapabilities.md)
`collectionId` | string
`completed` | boolean
`createdAt` | Date
`createdBy` | string
`creator` | [AuthorSummary](AuthorSummary.md)
`id` | string
`position` | number
`title` | string
`updatedAt` | Date
`version` | number

## Example

```typescript
import type { CollectionItemDetail } from ''

// TODO: Update the object below with actual values
const example = {
  "capabilities": null,
  "collectionId": null,
  "completed": null,
  "createdAt": null,
  "createdBy": null,
  "creator": null,
  "id": null,
  "position": null,
  "title": null,
  "updatedAt": null,
  "version": null,
} satisfies CollectionItemDetail

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as CollectionItemDetail
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


