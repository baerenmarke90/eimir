
# RecapFilmView

The frozen look of a monthly film, from a fixed catalogue of design variants.
 *
 * Names map to design tokens in the reader. Selection scores and reasons are
 * deliberately not part of the contract.

## Properties

Name | Type
------------ | -------------
`cover` | string
`highlightKey` | string
`layouts` | { [key: string]: Array&lt;string&gt;; }
`mood` | string
`motions` | Array&lt;string&gt;
`tags` | [Array&lt;RecapTagView&gt;](RecapTagView.md)
`transitions` | Array&lt;string&gt;

## Example

```typescript
import type { RecapFilmView } from ''

// TODO: Update the object below with actual values
const example = {
  "cover": null,
  "highlightKey": null,
  "layouts": null,
  "mood": null,
  "motions": null,
  "tags": null,
  "transitions": null,
} satisfies RecapFilmView

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as RecapFilmView
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


