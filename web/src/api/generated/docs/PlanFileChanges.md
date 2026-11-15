
# PlanFileChanges

Apply the editor\'s additions and removals to the current Plan version.

## Properties

Name | Type
------------ | -------------
`add` | Array&lt;string&gt;
`remove` | Array&lt;string&gt;

## Example

```typescript
import type { PlanFileChanges } from ''

// TODO: Update the object below with actual values
const example = {
  "add": null,
  "remove": null,
} satisfies PlanFileChanges

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as PlanFileChanges
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


