
# StoryLifelineView


## Properties

Name | Type
------------ | -------------
`startsOn` | Date
`today` | Date
`weeks` | [Array&lt;StoryLifelineWeek&gt;](StoryLifelineWeek.md)

## Example

```typescript
import type { StoryLifelineView } from ''

// TODO: Update the object below with actual values
const example = {
  "startsOn": null,
  "today": null,
  "weeks": null,
} satisfies StoryLifelineView

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as StoryLifelineView
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


