
# RelationTargets

Targets linked to a place.  Only IDs are returned. Content is fetched through each target domain\'s own route and authorization guard; returning content here would create a second read path with separate authorization logic.

## Properties

Name | Type
------------ | -------------
`items` | Array&lt;string&gt;

## Example

```typescript
import type { RelationTargets } from ''

// TODO: Update the object below with actual values
const example = {
  "items": null,
} satisfies RelationTargets

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as RelationTargets
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


