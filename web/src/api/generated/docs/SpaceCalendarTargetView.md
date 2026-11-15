
# SpaceCalendarTargetView


## Properties

Name | Type
------------ | -------------
`calendarName` | string
`calendarPrimary` | boolean
`conflicts` | [Array&lt;CalendarConflictView&gt;](CalendarConflictView.md)
`connectionId` | string
`failedCount` | number
`keptCount` | number
`lastSuccessAt` | Date
`pendingCount` | number
`service` | string
`sponsor` | [AuthorSummary](AuthorSummary.md)
`sponsoredByMe` | boolean
`status` | string
`statusReason` | string
`syncedCount` | number

## Example

```typescript
import type { SpaceCalendarTargetView } from ''

// TODO: Update the object below with actual values
const example = {
  "calendarName": null,
  "calendarPrimary": null,
  "conflicts": null,
  "connectionId": null,
  "failedCount": null,
  "keptCount": null,
  "lastSuccessAt": null,
  "pendingCount": null,
  "service": null,
  "sponsor": null,
  "sponsoredByMe": null,
  "status": null,
  "statusReason": null,
  "syncedCount": null,
} satisfies SpaceCalendarTargetView

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as SpaceCalendarTargetView
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


