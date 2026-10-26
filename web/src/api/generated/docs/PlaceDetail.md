
# PlaceDetail


## Properties

Name | Type
------------ | -------------
`address` | string
`capabilities` | [ResourceCapabilities](ResourceCapabilities.md)
`createdAt` | Date
`createdBy` | string
`creator` | [AuthorSummary](AuthorSummary.md)
`description` | string
`id` | string
`latitude` | number
`longitude` | number
`mapUrl` | string
`name` | string
`photoLocation` | boolean
`spaceId` | string
`updatedAt` | Date
`version` | number

## Example

```typescript
import type { PlaceDetail } from ''

// TODO: Update the object below with actual values
const example = {
  "address": null,
  "capabilities": null,
  "createdAt": null,
  "createdBy": null,
  "creator": null,
  "description": null,
  "id": null,
  "latitude": null,
  "longitude": null,
  "mapUrl": null,
  "name": null,
  "photoLocation": null,
  "spaceId": null,
  "updatedAt": null,
  "version": null,
} satisfies PlaceDetail

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as PlaceDetail
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


