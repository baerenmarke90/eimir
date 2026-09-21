
# DailyCheckInInsightDayView


## Properties

Name | Type
------------ | -------------
`checkedOn` | Date
`ownEnergy` | number
`ownVibe` | [DailyVibe](DailyVibe.md)
`partnerEnergy` | [PartnerEnergyProjection](PartnerEnergyProjection.md)
`partnerVibe` | [PartnerVibeProjection](PartnerVibeProjection.md)

## Example

```typescript
import type { DailyCheckInInsightDayView } from ''

// TODO: Update the object below with actual values
const example = {
  "checkedOn": null,
  "ownEnergy": null,
  "ownVibe": null,
  "partnerEnergy": null,
  "partnerVibe": null,
} satisfies DailyCheckInInsightDayView

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as DailyCheckInInsightDayView
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


