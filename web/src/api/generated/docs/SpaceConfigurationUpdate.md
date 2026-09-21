
# SpaceConfigurationUpdate

Partial typed update for Space-wide module configuration.

## Properties

Name | Type
------------ | -------------
`dailyContextTimezone` | string
`dailyQuestionsEnabled` | boolean
`energyCheckInEnabled` | boolean
`energyVisibilityMode` | [DailyCheckInVisibilityMode](DailyCheckInVisibilityMode.md)
`loveNotesEnabled` | boolean
`sharedAchievementsEnabled` | boolean
`supportGesturesEnabled` | boolean
`vibeCheckEnabled` | boolean
`vibeVisibilityMode` | [DailyCheckInVisibilityMode](DailyCheckInVisibilityMode.md)

## Example

```typescript
import type { SpaceConfigurationUpdate } from ''

// TODO: Update the object below with actual values
const example = {
  "dailyContextTimezone": null,
  "dailyQuestionsEnabled": null,
  "energyCheckInEnabled": null,
  "energyVisibilityMode": null,
  "loveNotesEnabled": null,
  "sharedAchievementsEnabled": null,
  "supportGesturesEnabled": null,
  "vibeCheckEnabled": null,
  "vibeVisibilityMode": null,
} satisfies SpaceConfigurationUpdate

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as SpaceConfigurationUpdate
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


