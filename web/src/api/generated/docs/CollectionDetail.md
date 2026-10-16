
# CollectionDetail


## Properties

Name | Type
------------ | -------------
`capabilities` | [ResourceCapabilities](ResourceCapabilities.md)
`createdAt` | Date
`createdBy` | string
`creator` | [AuthorSummary](AuthorSummary.md)
`id` | string
`items` | [Array&lt;CollectionItemDetail&gt;](CollectionItemDetail.md)
`spaceId` | string
`title` | string
`updatedAt` | Date
`version` | number

## Example

```typescript
import type { CollectionDetail } from ''

// TODO: Update the object below with actual values
const example = {
  "capabilities": null,
  "createdAt": null,
  "createdBy": null,
  "creator": null,
  "id": null,
  "items": null,
  "spaceId": null,
  "title": null,
  "updatedAt": null,
  "version": null,
} satisfies CollectionDetail

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as CollectionDetail
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


