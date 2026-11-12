
# WishDetail


## Properties

Name | Type
------------ | -------------
`capabilities` | [ResourceCapabilities](ResourceCapabilities.md)
`createdAt` | Date
`createdBy` | string
`creator` | [AuthorSummary](AuthorSummary.md)
`description` | string
`id` | string
`spaceId` | string
`status` | [WishStatus](WishStatus.md)
`tags` | Array&lt;string&gt;
`title` | string
`updatedAt` | Date
`version` | number

## Example

```typescript
import type { WishDetail } from ''

// TODO: Update the object below with actual values
const example = {
  "capabilities": null,
  "createdAt": null,
  "createdBy": null,
  "creator": null,
  "description": null,
  "id": null,
  "spaceId": null,
  "status": null,
  "tags": null,
  "title": null,
  "updatedAt": null,
  "version": null,
} satisfies WishDetail

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as WishDetail
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


