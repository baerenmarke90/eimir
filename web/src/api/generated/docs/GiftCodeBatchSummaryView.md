
# GiftCodeBatchSummaryView

One batch with the number of its codes in each state.

## Properties

Name | Type
------------ | -------------
`createdAt` | Date
`durationMonths` | number
`expired` | number
`handedOut` | number
`id` | string
`note` | string
`open` | number
`redeemableUntil` | Date
`redeemed` | number
`revoked` | number
`revokedAt` | Date
`total` | number

## Example

```typescript
import type { GiftCodeBatchSummaryView } from ''

// TODO: Update the object below with actual values
const example = {
  "createdAt": null,
  "durationMonths": null,
  "expired": null,
  "handedOut": null,
  "id": null,
  "note": null,
  "open": null,
  "redeemableUntil": null,
  "redeemed": null,
  "revoked": null,
  "revokedAt": null,
  "total": null,
} satisfies GiftCodeBatchSummaryView

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as GiftCodeBatchSummaryView
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


