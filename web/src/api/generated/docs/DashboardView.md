
# DashboardView


## Properties

Name | Type
------------ | -------------
`anticipation` | [DashboardAnticipation](DashboardAnticipation.md)
`incomingExperience` | [DashboardExperience](DashboardExperience.md)
`keepsake` | [DashboardItem](DashboardItem.md)
`recentShared` | [Array&lt;DashboardItem&gt;](DashboardItem.md)
`relationshipDuration` | [DashboardRelationshipDuration](DashboardRelationshipDuration.md)
`retrospective` | [DashboardItem](DashboardItem.md)
`sharedStorySummary` | [DashboardSharedStorySummary](DashboardSharedStorySummary.md)
`space` | [DashboardSpaceSummary](DashboardSpaceSummary.md)
`thinkingOfYouAvailableAt` | Date
`upcoming` | [Array&lt;DashboardItem&gt;](DashboardItem.md)
`viewerLocalDate` | Date

## Example

```typescript
import type { DashboardView } from ''

// TODO: Update the object below with actual values
const example = {
  "anticipation": null,
  "incomingExperience": null,
  "keepsake": null,
  "recentShared": null,
  "relationshipDuration": null,
  "retrospective": null,
  "sharedStorySummary": null,
  "space": null,
  "thinkingOfYouAvailableAt": null,
  "upcoming": null,
  "viewerLocalDate": null,
} satisfies DashboardView

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as DashboardView
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


