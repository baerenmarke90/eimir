
# GiftIdeaDetail


## Properties

Name | Type
------------ | -------------
`capabilities` | [ResourceCapabilities](ResourceCapabilities.md)
`createdAt` | Date
`description` | string
`id` | string
`occasion` | string
`ownerId` | string
`pinned` | boolean
`priceText` | string
`recipient` | string
`spaceId` | string
`status` | [GiftIdeaStatus](GiftIdeaStatus.md)
`targetOn` | Date
`title` | string
`updatedAt` | Date
`url` | string
`version` | number

## Example

```typescript
import type { GiftIdeaDetail } from ''

// TODO: Update the object below with actual values
const example = {
  "capabilities": null,
  "createdAt": null,
  "description": null,
  "id": null,
  "occasion": null,
  "ownerId": null,
  "pinned": null,
  "priceText": null,
  "recipient": null,
  "spaceId": null,
  "status": null,
  "targetOn": null,
  "title": null,
  "updatedAt": null,
  "url": null,
  "version": null,
} satisfies GiftIdeaDetail

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as GiftIdeaDetail
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


