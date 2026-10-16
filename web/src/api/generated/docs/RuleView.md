
# RuleView


## Properties

Name | Type
------------ | -------------
`actionKind` | string
`catalogVersion` | number
`enabled` | boolean
`parameters` | [RuleParametersView](RuleParametersView.md)
`ruleKey` | string
`sourceType` | string

## Example

```typescript
import type { RuleView } from ''

// TODO: Update the object below with actual values
const example = {
  "actionKind": null,
  "catalogVersion": null,
  "enabled": null,
  "parameters": null,
  "ruleKey": null,
  "sourceType": null,
} satisfies RuleView

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as RuleView
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


