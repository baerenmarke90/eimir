
# DailyCheckInInsightsView


## Properties

Name | Type
------------ | -------------
`dailyContextTimezone` | string
`days` | [Array&lt;DailyCheckInInsightDayView&gt;](DailyCheckInInsightDayView.md)
`endDate` | Date
`energyEnabled` | boolean
`startDate` | Date
`summary` | [DailyCheckInInsightSummaryView](DailyCheckInInsightSummaryView.md)
`vibeEnabled` | boolean

## Example

```typescript
import type { DailyCheckInInsightsView } from ''

// TODO: Update the object below with actual values
const example = {
  "dailyContextTimezone": null,
  "days": null,
  "endDate": null,
  "energyEnabled": null,
  "startDate": null,
  "summary": null,
  "vibeEnabled": null,
} satisfies DailyCheckInInsightsView

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as DailyCheckInInsightsView
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


