import {
  NearBindgen,
  near,
  call,
  view,
  initialize,
  LookupMap,
  UnorderedMap,
  assert,
} from "near-sdk-js";
import { AccountId } from "near-sdk-js/lib/types";
import { NonFungibleToken } from "./impl";
import { NFTContractMetadata, TokenMetadata } from "./metadata";
import { TokenId } from "./token";
import { IntoStorageKey } from "./utils";

class StorageKey {}

class StorageKeyNonFungibleToken extends StorageKey implements IntoStorageKey {
  into_storage_key(): string {
    return "NFT_";
  }
}

class StorageKeyTokenMetadata extends StorageKey implements IntoStorageKey {
  into_storage_key(): string {
    return "TOKEN_METADATA_";
  }
}

class StorageKeyTokenEnumeration extends StorageKey implements IntoStorageKey {
  into_storage_key(): string {
    return "TOKEN_ENUMERATION_";
  }
}

class StorageKeyApproval extends StorageKey implements IntoStorageKey {
  into_storage_key(): string {
    return "APPROVAL1_";
  }
}

@NearBindgen({})
class Contract {
  tokens: NonFungibleToken;
  metadata: NFTContractMetadata;

  constructor() {
    this.tokens = new NonFungibleToken();
    this.metadata = new NFTContractMetadata();
  }
  @initialize({})
  init({
    owner_id,
    metadata,
  }: {
    owner_id: AccountId;
    metadata: NFTContractMetadata;
  }) {
    this.metadata = Object.assign(new NFTContractMetadata(), metadata);
    this.metadata.assert_valid();
    this.tokens = new NonFungibleToken();
    this.tokens.init(
      new StorageKeyNonFungibleToken(),
      owner_id,
      new StorageKeyTokenMetadata(),
      new StorageKeyTokenEnumeration(),
      new StorageKeyApproval()
    );
  }

  @call({})
  nft_mint({
    token_id,
    token_owner_id,
    token_metadata,
  }: {
    token_id: TokenId;
    token_owner_id: AccountId;
    token_metadata: TokenMetadata;
  }) {
    assert(
      near.predecessorAccountId() === this.tokens.owner_id,
      "Unauthorized"
    );
    this.tokens.internal_mint(token_id, token_owner_id, token_metadata);
  }
  // @call({})
  // mint_nft({
  //   token_owner_id,
  //   name,
  //   description,
  //   meta_uri,
  //   level,
  // }: {
  //   token_owner_id: string;
  //   name: string | null;
  //   description: string | null;
  //   meta_uri: string | null;
  //   level: number | null;
  // }) {
  //   this.owner_by_id.set(this.token_id.toString(), token_owner_id);

  //   let token = new Token(this.token_id, token_owner_id);

  //   this.token_by_id.set(this.token_id.toString(), token);

  //   this.token_id++;

  //   return token;
  // }
  // @view({})
  // get_token_by_id({ token_id }: { token_id: number }) {
  //   let token = this.token_by_id.get(token_id.toString());
  //   if (token === null) {
  //     return null;
  //   }
  //   return token;
  // }
  // @view({})
  // get_supply_tokens() {
  //   return this.token_id;
  // }
  // @view({})
  // get_all_token({ start, end }: { start?: number; end?: number }) {
  //   let all_tokens = [];
  //   for (let i = 0; i < this.token_id; i++) {
  //     all_tokens.push(this.token_by_id.get(i.toString()));
  //   }

  //   return all_tokens;
  // }
}
