
# CalendarSyncView


## Properties

Name | Type
------------ | -------------
`available` | boolean
`canSync` | boolean
`connections` | [Array&lt;CalendarConnectionView&gt;](CalendarConnectionView.md)
`services` | Array&lt;string&gt;
`target` | [SpaceCalendarTargetView](SpaceCalendarTargetView.md)
`targetToken` | string

## Example

```typescript
import type { CalendarSyncView } from ''

// TODO: Update the object below with actual values
const example = {
  "available": null,
  "canSync": null,
  "connections": null,
  "services": null,
  "target": null,
  "targetToken": null,
} satisfies CalendarSyncView

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as CalendarSyncView
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


