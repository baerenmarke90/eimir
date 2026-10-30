
# WishSelectionView


## Properties

Name | Type
------------ | -------------
`candidates` | [Array&lt;WishSelectionCandidateView&gt;](WishSelectionCandidateView.md)
`commonWishIds` | Array&lt;string&gt;
`id` | string
`own` | [WishSelectionOwnView](WishSelectionOwnView.md)
`resultState` | string
`roundToken` | string
`selectionToken` | string
`title` | string
`version` | number

## Example

```typescript
import type { WishSelectionView } from ''

// TODO: Update the object below with actual values
const example = {
  "candidates": null,
  "commonWishIds": null,
  "id": null,
  "own": null,
  "resultState": null,
  "roundToken": null,
  "selectionToken": null,
  "title": null,
  "version": null,
} satisfies WishSelectionView

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as WishSelectionView
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


