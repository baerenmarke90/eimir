
# WeeklyReviewView


## Properties

Name | Type
------------ | -------------
`evidenceToken` | string
`feedback` | [Array&lt;WeeklyFeedbackView&gt;](WeeklyFeedbackView.md)
`general` | boolean
`generatedBy` | string
`historyEnd` | Date
`historyStart` | Date
`observations` | [Array&lt;WeeklyObservationView&gt;](WeeklyObservationView.md)
`recommendations` | [Array&lt;RecommendationKey&gt;](RecommendationKey.md)
`weekEnd` | Date
`weekStart` | Date

## Example

```typescript
import type { WeeklyReviewView } from ''

// TODO: Update the object below with actual values
const example = {
  "evidenceToken": null,
  "feedback": null,
  "general": null,
  "generatedBy": null,
  "historyEnd": null,
  "historyStart": null,
  "observations": null,
  "recommendations": null,
  "weekEnd": null,
  "weekStart": null,
} satisfies WeeklyReviewView

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as WeeklyReviewView
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


