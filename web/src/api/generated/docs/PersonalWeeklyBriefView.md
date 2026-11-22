
# PersonalWeeklyBriefView


## Properties

Name | Type
------------ | -------------
`elapsedDays` | number
`goodDays` | Array&lt;Date&gt;
`headline` | [PersonalBriefHeadline](PersonalBriefHeadline.md)
`higherWeekday` | [PersonalWeekdayPatternView](PersonalWeekdayPatternView.md)
`lowerWeekday` | [PersonalWeekdayPatternView](PersonalWeekdayPatternView.md)
`ownDays` | Array&lt;Date&gt;
`sharedDays` | Array&lt;Date&gt;
`sharedEnergy` | [PersonalEnergyComparisonView](PersonalEnergyComparisonView.md)
`weekEnd` | Date
`weekStart` | Date

## Example

```typescript
import type { PersonalWeeklyBriefView } from ''

// TODO: Update the object below with actual values
const example = {
  "elapsedDays": null,
  "goodDays": null,
  "headline": null,
  "higherWeekday": null,
  "lowerWeekday": null,
  "ownDays": null,
  "sharedDays": null,
  "sharedEnergy": null,
  "weekEnd": null,
  "weekStart": null,
} satisfies PersonalWeeklyBriefView

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as PersonalWeeklyBriefView
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


