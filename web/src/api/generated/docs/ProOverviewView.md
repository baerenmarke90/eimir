
# ProOverviewView

Aggregates only: no names and no codes.

## Properties

Name | Type
------------ | -------------
`batches` | [Array&lt;GiftCodeBatchSummaryView&gt;](GiftCodeBatchSummaryView.md)
`cancellations30d` | number
`play` | [ProPlayStatesView](ProPlayStatesView.md)
`premiumByGift` | number
`premiumByPlay` | number
`runningGifts` | [Array&lt;RunningGiftView&gt;](RunningGiftView.md)
`runningGiftsTotal` | number
`spacesPremium` | number
`spacesTotal` | number

## Example

```typescript
import type { ProOverviewView } from ''

// TODO: Update the object below with actual values
const example = {
  "batches": null,
  "cancellations30d": null,
  "play": null,
  "premiumByGift": null,
  "premiumByPlay": null,
  "runningGifts": null,
  "runningGiftsTotal": null,
  "spacesPremium": null,
  "spacesTotal": null,
} satisfies ProOverviewView

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as ProOverviewView
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


