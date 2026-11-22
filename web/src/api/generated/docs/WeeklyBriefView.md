
# WeeklyBriefView


## Properties

Name | Type
------------ | -------------
`attention` | [WeeklyBriefAttention](WeeklyBriefAttention.md)
`attentionDays` | number
`elapsedDays` | number
`followUp` | [WeeklyBriefPlanView](WeeklyBriefPlanView.md)
`goodDays` | Array&lt;Date&gt;
`headline` | [WeeklyBriefHeadline](WeeklyBriefHeadline.md)
`highlight` | [WeeklyBriefMomentView](WeeklyBriefMomentView.md)
`jointDays` | number
`newObservations` | [Array&lt;WeeklyObservationView&gt;](WeeklyObservationView.md)
`sharedDays` | Array&lt;Date&gt;
`suggestedDate` | Date
`weekEnd` | Date
`weekStart` | Date
`wishes` | [Array&lt;WeeklyBriefWishView&gt;](WeeklyBriefWishView.md)

## Example

```typescript
import type { WeeklyBriefView } from ''

// TODO: Update the object below with actual values
const example = {
  "attention": null,
  "attentionDays": null,
  "elapsedDays": null,
  "followUp": null,
  "goodDays": null,
  "headline": null,
  "highlight": null,
  "jointDays": null,
  "newObservations": null,
  "sharedDays": null,
  "suggestedDate": null,
  "weekEnd": null,
  "weekStart": null,
  "wishes": null,
} satisfies WeeklyBriefView

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as WeeklyBriefView
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


