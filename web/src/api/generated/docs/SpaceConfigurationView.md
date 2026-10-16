
# SpaceConfigurationView

Shared typed module configuration visible to both active partners.

## Properties

Name | Type
------------ | -------------
`canManageSpaceConfiguration` | boolean
`dailyContextTimezone` | string
`dailyQuestionsEnabled` | boolean
`energyCheckInEnabled` | boolean
`energyVisibilityMode` | [DailyCheckInVisibilityMode](DailyCheckInVisibilityMode.md)
`loveNotesEnabled` | boolean
`sharedAchievementsEnabled` | boolean
`spaceId` | string
`supportGesturesEnabled` | boolean
`version` | number
`vibeCheckEnabled` | boolean
`vibeVisibilityMode` | [DailyCheckInVisibilityMode](DailyCheckInVisibilityMode.md)

## Example

```typescript
import type { SpaceConfigurationView } from ''

// TODO: Update the object below with actual values
const example = {
  "canManageSpaceConfiguration": null,
  "dailyContextTimezone": null,
  "dailyQuestionsEnabled": null,
  "energyCheckInEnabled": null,
  "energyVisibilityMode": null,
  "loveNotesEnabled": null,
  "sharedAchievementsEnabled": null,
  "spaceId": null,
  "supportGesturesEnabled": null,
  "version": null,
  "vibeCheckEnabled": null,
  "vibeVisibilityMode": null,
} satisfies SpaceConfigurationView

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as SpaceConfigurationView
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


