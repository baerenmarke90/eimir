# GamesApi

All URIs are relative to *http://localhost*

| Method | HTTP request | Description |
|------------- | ------------- | -------------|
| [**acknowledgeGardenNews**](GamesApi.md#acknowledgegardennews) | **POST** /api/v1/spaces/{spaceId}/games/garden/news/seen | Acknowledge Garden News |
| [**closeGardenBouquet**](GamesApi.md#closegardenbouquet) | **POST** /api/v1/spaces/{spaceId}/games/garden/bouquets/{bouquetId}/close | Close Garden Bouquet |
| [**createHeartHuntRound**](GamesApi.md#createhearthuntround) | **POST** /api/v1/spaces/{spaceId}/games/heart-hunt/rounds | Create Round |
| [**getCoupleExperienceQuestions**](GamesApi.md#getcoupleexperiencequestions) | **GET** /api/v1/spaces/{spaceId}/experiences/{kind}/questions | Get Couple Experience Questions |
| [**getGameMomentCandidates**](GamesApi.md#getgamemomentcandidates) | **GET** /api/v1/spaces/{spaceId}/games/moments/candidates | Get Game Moment Candidates |
| [**getGameWishCandidates**](GamesApi.md#getgamewishcandidates) | **GET** /api/v1/spaces/{spaceId}/games/wishes/candidates | Get Game Wish Candidates |
| [**getGarden**](GamesApi.md#getgarden) | **GET** /api/v1/spaces/{spaceId}/games/garden | Get Garden |
| [**getHeartHunt**](GamesApi.md#gethearthunt) | **GET** /api/v1/spaces/{spaceId}/games/heart-hunt | Get Heart Hunt |
| [**giveGardenBouquet**](GamesApi.md#givegardenbouquet) | **POST** /api/v1/spaces/{spaceId}/games/garden/bouquets | Give Garden Bouquet |
| [**keepHeartHuntRound**](GamesApi.md#keephearthuntround) | **POST** /api/v1/spaces/{spaceId}/games/heart-hunt/rounds/{roundId}/kept | Keep Round |
| [**plantGardenSeed**](GamesApi.md#plantgardenseed) | **POST** /api/v1/spaces/{spaceId}/games/garden/seeds/{seedId}/plant | Plant Garden Seed |
| [**renameGarden**](GamesApi.md#renamegarden) | **PUT** /api/v1/spaces/{spaceId}/games/garden/name | Rename Garden |
| [**sendGardenSeed**](GamesApi.md#sendgardenseed) | **POST** /api/v1/spaces/{spaceId}/games/garden/seeds | Send Garden Seed |
| [**tapHeartHuntRound**](GamesApi.md#taphearthuntround) | **POST** /api/v1/spaces/{spaceId}/games/heart-hunt/rounds/{roundId}/taps | Tap Round |
| [**waterGardenPlant**](GamesApi.md#watergardenplant) | **POST** /api/v1/spaces/{spaceId}/games/garden/waterings | Water Garden Plant |



## acknowledgeGardenNews

> GardenView acknowledgeGardenNews(spaceId)

Acknowledge Garden News

The reader saw what is new in the garden; each unlock is shown once.

### Example

```ts
import {
  Configuration,
  GamesApi,
} from '';
import type { AcknowledgeGardenNewsRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new GamesApi();

  const body = {
    // string
    spaceId: spaceId_example,
  } satisfies AcknowledgeGardenNewsRequest;

  try {
    const data = await api.acknowledgeGardenNews(body);
    console.log(data);
  } catch (error) {
    console.error(error);
  }
}

// Run the test
example().catch(console.error);
```

### Parameters


| Name | Type | Description  | Notes |
|------------- | ------------- | ------------- | -------------|
| **spaceId** | `string` |  | [Defaults to `undefined`] |

### Return type

[**GardenView**](GardenView.md)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | Successful Response |  -  |
| **401** | Authentication is missing, invalid, or the session has expired. |  -  |
| **403** | The caller is authenticated but is not authorized for this operation. |  -  |
| **404** | The resource does not exist or is not visible to the caller. |  -  |
| **409** | The request conflicts with the current state of the resource. |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## closeGardenBouquet

> GardenView closeGardenBouquet(bouquetId, spaceId, gardenBouquetCloseInput)

Close Garden Bouquet

Close a received bouquet\&#39;s card, optionally noting it went into Momente.

### Example

```ts
import {
  Configuration,
  GamesApi,
} from '';
import type { CloseGardenBouquetRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new GamesApi();

  const body = {
    // string
    bouquetId: bouquetId_example,
    // string
    spaceId: spaceId_example,
    // GardenBouquetCloseInput
    gardenBouquetCloseInput: ...,
  } satisfies CloseGardenBouquetRequest;

  try {
    const data = await api.closeGardenBouquet(body);
    console.log(data);
  } catch (error) {
    console.error(error);
  }
}

// Run the test
example().catch(console.error);
```

### Parameters


| Name | Type | Description  | Notes |
|------------- | ------------- | ------------- | -------------|
| **bouquetId** | `string` |  | [Defaults to `undefined`] |
| **spaceId** | `string` |  | [Defaults to `undefined`] |
| **gardenBouquetCloseInput** | [GardenBouquetCloseInput](GardenBouquetCloseInput.md) |  | |

### Return type

[**GardenView**](GardenView.md)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: `application/json`
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | Successful Response |  -  |
| **401** | Authentication is missing, invalid, or the session has expired. |  -  |
| **403** | The caller is authenticated but is not authorized for this operation. |  -  |
| **404** | The resource does not exist or is not visible to the caller. |  -  |
| **409** | The request conflicts with the current state of the resource. |  -  |
| **422** | Request parameters or domain inputs are invalid. |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## createHeartHuntRound

> HeartHuntRoundView createHeartHuntRound(spaceId, heartHuntRoundCreate)

Create Round

Hide a heart in an uploaded photo and send it to the partner.

### Example

```ts
import {
  Configuration,
  GamesApi,
} from '';
import type { CreateHeartHuntRoundRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new GamesApi();

  const body = {
    // string
    spaceId: spaceId_example,
    // HeartHuntRoundCreate
    heartHuntRoundCreate: ...,
  } satisfies CreateHeartHuntRoundRequest;

  try {
    const data = await api.createHeartHuntRound(body);
    console.log(data);
  } catch (error) {
    console.error(error);
  }
}

// Run the test
example().catch(console.error);
```

### Parameters


| Name | Type | Description  | Notes |
|------------- | ------------- | ------------- | -------------|
| **spaceId** | `string` |  | [Defaults to `undefined`] |
| **heartHuntRoundCreate** | [HeartHuntRoundCreate](HeartHuntRoundCreate.md) |  | |

### Return type

[**HeartHuntRoundView**](HeartHuntRoundView.md)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: `application/json`
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **201** | Successful Response |  -  |
| **401** | Authentication is missing, invalid, or the session has expired. |  -  |
| **403** | The caller is authenticated but is not authorized for this operation. |  -  |
| **404** | The resource does not exist or is not visible to the caller. |  -  |
| **409** | The request conflicts with the current state of the resource. |  -  |
| **422** | Request parameters or domain inputs are invalid. |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## getCoupleExperienceQuestions

> CoupleExperienceQuestions getCoupleExperienceQuestions(kind, spaceId)

Get Couple Experience Questions

Three stable inspirations per shared calendar day, without an answer limit.

### Example

```ts
import {
  Configuration,
  GamesApi,
} from '';
import type { GetCoupleExperienceQuestionsRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new GamesApi();

  const body = {
    // ExperienceKind
    kind: ...,
    // string
    spaceId: spaceId_example,
  } satisfies GetCoupleExperienceQuestionsRequest;

  try {
    const data = await api.getCoupleExperienceQuestions(body);
    console.log(data);
  } catch (error) {
    console.error(error);
  }
}

// Run the test
example().catch(console.error);
```

### Parameters


| Name | Type | Description  | Notes |
|------------- | ------------- | ------------- | -------------|
| **kind** | `ExperienceKind` |  | [Defaults to `undefined`] [Enum: HAPPINESS, TIME_TRAVEL] |
| **spaceId** | `string` |  | [Defaults to `undefined`] |

### Return type

[**CoupleExperienceQuestions**](CoupleExperienceQuestions.md)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | Successful Response |  -  |
| **401** | Authentication is missing, invalid, or the session has expired. |  -  |
| **403** | The caller is authenticated but is not authorized for this operation. |  -  |
| **404** | The resource does not exist or is not visible to the caller. |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## getGameMomentCandidates

> GameMemoryCandidateSet getGameMomentCandidates(spaceId)

Get Game Moment Candidates

Return Premium-authorized shared photo Memories for the first #863 grammar.  Normal authentication and Space membership are resolved before this route receives &#x60;authorization&#x60;. Commercial entitlement is then enforced on the server. The actual content query remains constrained by the existing &#x60;readable()&#x60; authorization predicate and existing attachment bindings.

### Example

```ts
import {
  Configuration,
  GamesApi,
} from '';
import type { GetGameMomentCandidatesRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new GamesApi();

  const body = {
    // string
    spaceId: spaceId_example,
  } satisfies GetGameMomentCandidatesRequest;

  try {
    const data = await api.getGameMomentCandidates(body);
    console.log(data);
  } catch (error) {
    console.error(error);
  }
}

// Run the test
example().catch(console.error);
```

### Parameters


| Name | Type | Description  | Notes |
|------------- | ------------- | ------------- | -------------|
| **spaceId** | `string` |  | [Defaults to `undefined`] |

### Return type

[**GameMemoryCandidateSet**](GameMemoryCandidateSet.md)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | Successful Response |  -  |
| **401** | Authentication is missing, invalid, or the session has expired. |  -  |
| **403** | The caller is authenticated but is not authorized for this operation. |  -  |
| **404** | The resource does not exist or is not visible to the caller. |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## getGameWishCandidates

> GameWishCandidateSet getGameWishCandidates(spaceId)

Get Game Wish Candidates

Return Premium-authorized OPEN shared Wishes for #864.

### Example

```ts
import {
  Configuration,
  GamesApi,
} from '';
import type { GetGameWishCandidatesRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new GamesApi();

  const body = {
    // string
    spaceId: spaceId_example,
  } satisfies GetGameWishCandidatesRequest;

  try {
    const data = await api.getGameWishCandidates(body);
    console.log(data);
  } catch (error) {
    console.error(error);
  }
}

// Run the test
example().catch(console.error);
```

### Parameters


| Name | Type | Description  | Notes |
|------------- | ------------- | ------------- | -------------|
| **spaceId** | `string` |  | [Defaults to `undefined`] |

### Return type

[**GameWishCandidateSet**](GameWishCandidateSet.md)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | Successful Response |  -  |
| **401** | Authentication is missing, invalid, or the session has expired. |  -  |
| **403** | The caller is authenticated but is not authorized for this operation. |  -  |
| **404** | The resource does not exist or is not visible to the caller. |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## getGarden

> GardenView getGarden(spaceId)

Get Garden

The shared garden and today\&#39;s step for the reader.

### Example

```ts
import {
  Configuration,
  GamesApi,
} from '';
import type { GetGardenRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new GamesApi();

  const body = {
    // string
    spaceId: spaceId_example,
  } satisfies GetGardenRequest;

  try {
    const data = await api.getGarden(body);
    console.log(data);
  } catch (error) {
    console.error(error);
  }
}

// Run the test
example().catch(console.error);
```

### Parameters


| Name | Type | Description  | Notes |
|------------- | ------------- | ------------- | -------------|
| **spaceId** | `string` |  | [Defaults to `undefined`] |

### Return type

[**GardenView**](GardenView.md)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | Successful Response |  -  |
| **401** | Authentication is missing, invalid, or the session has expired. |  -  |
| **403** | The caller is authenticated but is not authorized for this operation. |  -  |
| **404** | The resource does not exist or is not visible to the caller. |  -  |
| **409** | The request conflicts with the current state of the resource. |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## getHeartHunt

> HeartHuntState getHeartHunt(spaceId)

Get Heart Hunt

Open rounds of the two partners; the seeker never receives the heart early.

### Example

```ts
import {
  Configuration,
  GamesApi,
} from '';
import type { GetHeartHuntRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new GamesApi();

  const body = {
    // string
    spaceId: spaceId_example,
  } satisfies GetHeartHuntRequest;

  try {
    const data = await api.getHeartHunt(body);
    console.log(data);
  } catch (error) {
    console.error(error);
  }
}

// Run the test
example().catch(console.error);
```

### Parameters


| Name | Type | Description  | Notes |
|------------- | ------------- | ------------- | -------------|
| **spaceId** | `string` |  | [Defaults to `undefined`] |

### Return type

[**HeartHuntState**](HeartHuntState.md)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | Successful Response |  -  |
| **401** | Authentication is missing, invalid, or the session has expired. |  -  |
| **403** | The caller is authenticated but is not authorized for this operation. |  -  |
| **404** | The resource does not exist or is not visible to the caller. |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## giveGardenBouquet

> GardenView giveGardenBouquet(spaceId, gardenBouquetInput)

Give Garden Bouquet

Give up to three blooming flowers to the partner; a seed stays in each place.

### Example

```ts
import {
  Configuration,
  GamesApi,
} from '';
import type { GiveGardenBouquetRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new GamesApi();

  const body = {
    // string
    spaceId: spaceId_example,
    // GardenBouquetInput
    gardenBouquetInput: ...,
  } satisfies GiveGardenBouquetRequest;

  try {
    const data = await api.giveGardenBouquet(body);
    console.log(data);
  } catch (error) {
    console.error(error);
  }
}

// Run the test
example().catch(console.error);
```

### Parameters


| Name | Type | Description  | Notes |
|------------- | ------------- | ------------- | -------------|
| **spaceId** | `string` |  | [Defaults to `undefined`] |
| **gardenBouquetInput** | [GardenBouquetInput](GardenBouquetInput.md) |  | |

### Return type

[**GardenView**](GardenView.md)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: `application/json`
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | Successful Response |  -  |
| **401** | Authentication is missing, invalid, or the session has expired. |  -  |
| **403** | The caller is authenticated but is not authorized for this operation. |  -  |
| **404** | The resource does not exist or is not visible to the caller. |  -  |
| **409** | The request conflicts with the current state of the resource. |  -  |
| **422** | Request parameters or domain inputs are invalid. |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## keepHeartHuntRound

> HeartHuntRoundView keepHeartHuntRound(roundId, spaceId, heartHuntKept)

Keep Round

Record that the found photo was saved as a shared Moment by explicit tap.

### Example

```ts
import {
  Configuration,
  GamesApi,
} from '';
import type { KeepHeartHuntRoundRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new GamesApi();

  const body = {
    // string
    roundId: roundId_example,
    // string
    spaceId: spaceId_example,
    // HeartHuntKept
    heartHuntKept: ...,
  } satisfies KeepHeartHuntRoundRequest;

  try {
    const data = await api.keepHeartHuntRound(body);
    console.log(data);
  } catch (error) {
    console.error(error);
  }
}

// Run the test
example().catch(console.error);
```

### Parameters


| Name | Type | Description  | Notes |
|------------- | ------------- | ------------- | -------------|
| **roundId** | `string` |  | [Defaults to `undefined`] |
| **spaceId** | `string` |  | [Defaults to `undefined`] |
| **heartHuntKept** | [HeartHuntKept](HeartHuntKept.md) |  | |

### Return type

[**HeartHuntRoundView**](HeartHuntRoundView.md)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: `application/json`
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | Successful Response |  -  |
| **401** | Authentication is missing, invalid, or the session has expired. |  -  |
| **403** | The caller is authenticated but is not authorized for this operation. |  -  |
| **404** | The resource does not exist or is not visible to the caller. |  -  |
| **409** | The request conflicts with the current state of the resource. |  -  |
| **422** | Request parameters or domain inputs are invalid. |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## plantGardenSeed

> GardenView plantGardenSeed(seedId, spaceId)

Plant Garden Seed

Plant a seed that arrived for the reader.

### Example

```ts
import {
  Configuration,
  GamesApi,
} from '';
import type { PlantGardenSeedRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new GamesApi();

  const body = {
    // string
    seedId: seedId_example,
    // string
    spaceId: spaceId_example,
  } satisfies PlantGardenSeedRequest;

  try {
    const data = await api.plantGardenSeed(body);
    console.log(data);
  } catch (error) {
    console.error(error);
  }
}

// Run the test
example().catch(console.error);
```

### Parameters


| Name | Type | Description  | Notes |
|------------- | ------------- | ------------- | -------------|
| **seedId** | `string` |  | [Defaults to `undefined`] |
| **spaceId** | `string` |  | [Defaults to `undefined`] |

### Return type

[**GardenView**](GardenView.md)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | Successful Response |  -  |
| **401** | Authentication is missing, invalid, or the session has expired. |  -  |
| **403** | The caller is authenticated but is not authorized for this operation. |  -  |
| **404** | The resource does not exist or is not visible to the caller. |  -  |
| **409** | The request conflicts with the current state of the resource. |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## renameGarden

> GardenView renameGarden(spaceId, gardenNameInput)

Rename Garden

Name the shared garden; it becomes the page title for both partners.

### Example

```ts
import {
  Configuration,
  GamesApi,
} from '';
import type { RenameGardenRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new GamesApi();

  const body = {
    // string
    spaceId: spaceId_example,
    // GardenNameInput
    gardenNameInput: ...,
  } satisfies RenameGardenRequest;

  try {
    const data = await api.renameGarden(body);
    console.log(data);
  } catch (error) {
    console.error(error);
  }
}

// Run the test
example().catch(console.error);
```

### Parameters


| Name | Type | Description  | Notes |
|------------- | ------------- | ------------- | -------------|
| **spaceId** | `string` |  | [Defaults to `undefined`] |
| **gardenNameInput** | [GardenNameInput](GardenNameInput.md) |  | |

### Return type

[**GardenView**](GardenView.md)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: `application/json`
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | Successful Response |  -  |
| **401** | Authentication is missing, invalid, or the session has expired. |  -  |
| **403** | The caller is authenticated but is not authorized for this operation. |  -  |
| **404** | The resource does not exist or is not visible to the caller. |  -  |
| **409** | The request conflicts with the current state of the resource. |  -  |
| **422** | Request parameters or domain inputs are invalid. |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## sendGardenSeed

> GardenView sendGardenSeed(spaceId, gardenSeedInput)

Send Garden Seed

Send today\&#39;s seed to the partner; one per partner and day.

### Example

```ts
import {
  Configuration,
  GamesApi,
} from '';
import type { SendGardenSeedRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new GamesApi();

  const body = {
    // string
    spaceId: spaceId_example,
    // GardenSeedInput
    gardenSeedInput: ...,
  } satisfies SendGardenSeedRequest;

  try {
    const data = await api.sendGardenSeed(body);
    console.log(data);
  } catch (error) {
    console.error(error);
  }
}

// Run the test
example().catch(console.error);
```

### Parameters


| Name | Type | Description  | Notes |
|------------- | ------------- | ------------- | -------------|
| **spaceId** | `string` |  | [Defaults to `undefined`] |
| **gardenSeedInput** | [GardenSeedInput](GardenSeedInput.md) |  | |

### Return type

[**GardenView**](GardenView.md)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: `application/json`
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | Successful Response |  -  |
| **401** | Authentication is missing, invalid, or the session has expired. |  -  |
| **403** | The caller is authenticated but is not authorized for this operation. |  -  |
| **404** | The resource does not exist or is not visible to the caller. |  -  |
| **409** | The request conflicts with the current state of the resource. |  -  |
| **422** | Request parameters or domain inputs are invalid. |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## tapHeartHuntRound

> HeartHuntTapResult tapHeartHuntRound(roundId, spaceId, heartHuntTap)

Tap Round

Clear fog at a tap; the answer is a coarse warmth and whether the heart was found.

### Example

```ts
import {
  Configuration,
  GamesApi,
} from '';
import type { TapHeartHuntRoundRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new GamesApi();

  const body = {
    // string
    roundId: roundId_example,
    // string
    spaceId: spaceId_example,
    // HeartHuntTap
    heartHuntTap: ...,
  } satisfies TapHeartHuntRoundRequest;

  try {
    const data = await api.tapHeartHuntRound(body);
    console.log(data);
  } catch (error) {
    console.error(error);
  }
}

// Run the test
example().catch(console.error);
```

### Parameters


| Name | Type | Description  | Notes |
|------------- | ------------- | ------------- | -------------|
| **roundId** | `string` |  | [Defaults to `undefined`] |
| **spaceId** | `string` |  | [Defaults to `undefined`] |
| **heartHuntTap** | [HeartHuntTap](HeartHuntTap.md) |  | |

### Return type

[**HeartHuntTapResult**](HeartHuntTapResult.md)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: `application/json`
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | Successful Response |  -  |
| **401** | Authentication is missing, invalid, or the session has expired. |  -  |
| **403** | The caller is authenticated but is not authorized for this operation. |  -  |
| **404** | The resource does not exist or is not visible to the caller. |  -  |
| **422** | Request parameters or domain inputs are invalid. |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## waterGardenPlant

> GardenView waterGardenPlant(spaceId, gardenWateringInput)

Water Garden Plant

Water one plant; a daily gesture that never changes growth.

### Example

```ts
import {
  Configuration,
  GamesApi,
} from '';
import type { WaterGardenPlantRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new GamesApi();

  const body = {
    // string
    spaceId: spaceId_example,
    // GardenWateringInput
    gardenWateringInput: ...,
  } satisfies WaterGardenPlantRequest;

  try {
    const data = await api.waterGardenPlant(body);
    console.log(data);
  } catch (error) {
    console.error(error);
  }
}

// Run the test
example().catch(console.error);
```

### Parameters


| Name | Type | Description  | Notes |
|------------- | ------------- | ------------- | -------------|
| **spaceId** | `string` |  | [Defaults to `undefined`] |
| **gardenWateringInput** | [GardenWateringInput](GardenWateringInput.md) |  | |

### Return type

[**GardenView**](GardenView.md)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: `application/json`
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | Successful Response |  -  |
| **401** | Authentication is missing, invalid, or the session has expired. |  -  |
| **403** | The caller is authenticated but is not authorized for this operation. |  -  |
| **404** | The resource does not exist or is not visible to the caller. |  -  |
| **409** | The request conflicts with the current state of the resource. |  -  |
| **422** | Request parameters or domain inputs are invalid. |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)

