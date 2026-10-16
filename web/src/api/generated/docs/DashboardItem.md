
# DashboardItem


## Properties

Name | Type
------------ | -------------
`createdAt` | Date
`id` | string
`occurredOn` | Date
`previewAttachmentId` | string
`scheduledAt` | Date
`scheduledOn` | Date
`titleOrText` | string
`type` | [DashboardItemType](DashboardItemType.md)

## Example

```typescript
import type { DashboardItem } from ''

// TODO: Update the object below with actual values
const example = {
  "createdAt": null,
  "id": null,
  "occurredOn": null,
  "previewAttachmentId": null,
  "scheduledAt": null,
  "scheduledOn": null,
  "titleOrText": null,
  "type": null,
} satisfies DashboardItem

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as DashboardItem
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


