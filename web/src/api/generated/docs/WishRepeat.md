
# WishRepeat

Optional overrides for \"Nochmal erleben\" (#1816).  Anything omitted is copied from the completed source Wish. Status, the follow-up link, and the series fields are server-controlled and rejected.

## Properties

Name | Type
------------ | -------------
`description` | string
`tags` | Array&lt;string&gt;
`title` | string

## Example

```typescript
import type { WishRepeat } from ''

// TODO: Update the object below with actual values
const example = {
  "description": null,
  "tags": null,
  "title": null,
} satisfies WishRepeat

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as WishRepeat
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


