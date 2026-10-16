
# PlanDetail


## Properties

Name | Type
------------ | -------------
`capabilities` | [ResourceCapabilities](ResourceCapabilities.md)
`createdAt` | Date
`createdBy` | string
`creator` | [AuthorSummary](AuthorSummary.md)
`description` | string
`experiencedOn` | Date
`id` | string
`placeId` | string
`plannedEnd` | Date
`plannedOn` | Date
`plannedStart` | Date
`sourceWishId` | string
`spaceId` | string
`status` | [PlanStatus](PlanStatus.md)
`title` | string
`updatedAt` | Date
`version` | number

## Example

```typescript
import type { PlanDetail } from ''

// TODO: Update the object below with actual values
const example = {
  "capabilities": null,
  "createdAt": null,
  "createdBy": null,
  "creator": null,
  "description": null,
  "experiencedOn": null,
  "id": null,
  "placeId": null,
  "plannedEnd": null,
  "plannedOn": null,
  "plannedStart": null,
  "sourceWishId": null,
  "spaceId": null,
  "status": null,
  "title": null,
  "updatedAt": null,
  "version": null,
} satisfies PlanDetail

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as PlanDetail
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


