
# WishDetectiveCurrentRound


## Properties

Name | Type
------------ | -------------
`clues` | Array&lt;string&gt;
`giverId` | string
`guesserId` | string
`phase` | [WishDetectivePhase](WishDetectivePhase.md)
`round` | number
`skipsLeft` | number
`wish` | [WishDetectiveWishView](WishDetectiveWishView.md)

## Example

```typescript
import type { WishDetectiveCurrentRound } from ''

// TODO: Update the object below with actual values
const example = {
  "clues": null,
  "giverId": null,
  "guesserId": null,
  "phase": null,
  "round": null,
  "skipsLeft": null,
  "wish": null,
} satisfies WishDetectiveCurrentRound

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as WishDetectiveCurrentRound
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


