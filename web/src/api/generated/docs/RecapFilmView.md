
# RecapFilmView

The frozen look of a recap film, from a fixed catalogue of design variants.  Names map to design tokens in the reader. Selection scores and reasons are deliberately not part of the contract. A year film lists the highlight of every month chapter; a monthly film lists none.

## Properties

Name | Type
------------ | -------------
`accents` | Array&lt;string&gt;
`cover` | string
`highlightKey` | string
`layouts` | { [key: string]: Array&lt;string&gt;; }
`monthHighlights` | [Array&lt;RecapFilmMonthView&gt;](RecapFilmMonthView.md)
`mood` | string
`motions` | Array&lt;string&gt;
`pace` | string
`tags` | [Array&lt;RecapTagView&gt;](RecapTagView.md)
`transitions` | Array&lt;string&gt;

## Example

```typescript
import type { RecapFilmView } from ''

// TODO: Update the object below with actual values
const example = {
  "accents": null,
  "cover": null,
  "highlightKey": null,
  "layouts": null,
  "monthHighlights": null,
  "mood": null,
  "motions": null,
  "pace": null,
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


