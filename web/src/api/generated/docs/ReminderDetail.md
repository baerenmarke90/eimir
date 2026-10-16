
# ReminderDetail


## Properties

Name | Type
------------ | -------------
`capabilities` | [ResourceCapabilities](ResourceCapabilities.md)
`createdAt` | Date
`createdBy` | string
`creator` | [AuthorSummary](AuthorSummary.md)
`description` | string
`id` | string
`muted` | boolean
`offsets` | Array&lt;number&gt;
`ruleKey` | string
`schedule` | [Schedule](Schedule.md)
`source` | [ReminderSource](ReminderSource.md)
`sourceId` | string
`sourceType` | string
`spaceId` | string
`title` | string
`updatedAt` | Date
`version` | number

## Example

```typescript
import type { ReminderDetail } from ''

// TODO: Update the object below with actual values
const example = {
  "capabilities": null,
  "createdAt": null,
  "createdBy": null,
  "creator": null,
  "description": null,
  "id": null,
  "muted": null,
  "offsets": null,
  "ruleKey": null,
  "schedule": null,
  "source": null,
  "sourceId": null,
  "sourceType": null,
  "spaceId": null,
  "title": null,
  "updatedAt": null,
  "version": null,
} satisfies ReminderDetail

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as ReminderDetail
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


