
# PrivateCollectionDetail


## Properties

Name | Type
------------ | -------------
`capabilities` | [ResourceCapabilities](ResourceCapabilities.md)
`createdAt` | Date
`id` | string
`items` | [Array&lt;PrivateCollectionItemDetail&gt;](PrivateCollectionItemDetail.md)
`ownerId` | string
`spaceId` | string
`title` | string
`updatedAt` | Date
`version` | number

## Example

```typescript
import type { PrivateCollectionDetail } from ''

// TODO: Update the object below with actual values
const example = {
  "capabilities": null,
  "createdAt": null,
  "id": null,
  "items": null,
  "ownerId": null,
  "spaceId": null,
  "title": null,
  "updatedAt": null,
  "version": null,
} satisfies PrivateCollectionDetail

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as PrivateCollectionDetail
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


