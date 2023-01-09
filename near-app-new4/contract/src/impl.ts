import {
  assert,
  LookupMap,
  near,
  NearPromise,
  UnorderedMap,
  UnorderedSet,
} from "near-sdk-js";
import { AccountId } from "near-sdk-js/lib/types";
import { bytes, serialize } from "near-sdk-js/lib/utils";
import { NftMint } from "./events";
import { TokenMetadata } from "./metadata";
import { Token, TokenId } from "./token";
import {
  assert_at_least_one_yocto,
  assert_one_yocto,
  IntoStorageKey,
  refund_deposit,
  refund_deposit_to_account,
  refund_storage_deposit,
  str,
} from "./utils";

const GAS_FOR_NFT_APPROVE = 20_000_000_000_000n;

function encUint8Array(str: string) {
  if (str === null) {
    throw new Error("str is null");
  }
  //encode Uint8Array
  const enc = new TextEncoder();
  return enc.encode(str);
}

function repeat(str: string, n: number) {
  return Array(n + 1).join(str);
}

function expect_token_found<T>(option: any): any {
  if (option === null) {
    throw new Error("Token not found");
  }
  return option;
}

function expect_approval<T>(option: any): any {
  if (option === null) {
    throw new Error("next_approval_by_id must be set for approval ext");
  }
  return option;
}

export class NonFungibleToken {
  public owner_id: AccountId;
  public extra_storage_in_bytes_per_token: bigint;
  public owner_by_id: UnorderedMap<AccountId>;
  public token_metadata_by_id: LookupMap<TokenMetadata>;
  public tokens_per_owner: LookupMap<UnorderedSet<TokenId>>;
  public approvals_by_id: LookupMap<{ [approvals: AccountId]: bigint }>;
  public next_approval_id_by_id: LookupMap<bigint>;

  constructor() {
    this.owner_id = "";
    this.extra_storage_in_bytes_per_token = 0n;
    this.owner_by_id = new UnorderedMap("");
    this.token_metadata_by_id = null;
    this.tokens_per_owner = null;
    this.approvals_by_id = null;
    this.next_approval_id_by_id = null;
  }

  init(
    owner_by_id_prefix: IntoStorageKey,
    owner_id: AccountId,
    token_metadata_prefix?: IntoStorageKey,
    enumeration_prefix?: IntoStorageKey,
    approval_prefix?: IntoStorageKey
  ) {
    let approvals_by_id: LookupMap<{ [approvals: AccountId]: bigint }>;
    let next_approval_id_by_id: LookupMap<bigint>;
    if (approval_prefix) {
      const prefix = approval_prefix.into_storage_key();
      approvals_by_id = new LookupMap(prefix);
      next_approval_id_by_id = new LookupMap(prefix + "n");
    } else {
      approvals_by_id = null;
      next_approval_id_by_id = null;
    }

    this.owner_id = owner_id;
    this.extra_storage_in_bytes_per_token = 0n;
    this.owner_by_id = new UnorderedMap(owner_by_id_prefix.into_storage_key());
    this.token_metadata_by_id = token_metadata_prefix
      ? new LookupMap(token_metadata_prefix.into_storage_key())
      : null;
    this.tokens_per_owner = enumeration_prefix
      ? new LookupMap(enumeration_prefix.into_storage_key())
      : null;
    this.approvals_by_id = approvals_by_id;
    this.next_approval_id_by_id = next_approval_id_by_id;
    this.measure_min_token_storage_cost();
  }

  internal_mint_with_refund(
    token_id: TokenId,
    token_owner_id: AccountId,
    token_metadata?: TokenMetadata,
    refund_id?: string
  ): Token {
    let initial_storage_usage: [string, bigint] = null;
    if (refund_id) {
      initial_storage_usage = [refund_id, near.storageUsage()];
    }
    if (this.token_metadata_by_id && token_metadata === undefined) {
      throw new Error("Must provide metadata");
    }
    if (this.owner_by_id.get(token_id)) {
      throw new Error("token_id must be unique");
    }

    const owner_id = token_owner_id;
    this.owner_by_id.set(token_id, owner_id);
    this.token_metadata_by_id?.set(token_id, token_metadata);
    if (this.tokens_per_owner) {
      let token_ids = this.tokens_per_owner.get(owner_id, {
        reconstructor: UnorderedSet.reconstruct,
      });
      if (token_ids === null) {
        token_ids = new UnorderedSet(
          new TokensPerOwner(
            encUint8Array(near.sha256(bytes(owner_id)))
          ).into_storage_key()
        );
      }
      token_ids.set(token_id);
      this.tokens_per_owner.set(owner_id, token_ids);
    }

    const approved_account_ids = this.approvals_by_id ? {} : undefined;
    if (initial_storage_usage) {
      const [id, storage_usage] = initial_storage_usage;
      refund_deposit_to_account(near.storageUsage() - storage_usage, id);
    }
    return new Token(token_id, owner_id, token_metadata, approved_account_ids);
  }

  internal_mint(
    token_id: TokenId,
    token_owner_id: AccountId,
    token_metadata?: TokenMetadata
  ): Token {
    const token = this.internal_mint_with_refund(
      token_id,
      token_owner_id,
      token_metadata,
      near.predecessorAccountId()
    );
    new NftMint(token.owner_id, [token.token_id]).emit();
    return token;
  }

  measure_min_token_storage_cost() {
    const initial_storage_usage = near.storageUsage();
    // 64 Length because this is the max account id length
    const tmp_token_id = repeat("a", 64);
    const tmp_owner_id = repeat("a", 64);

    // 1. set some dummy data
    this.owner_by_id.set(tmp_token_id, tmp_owner_id);
    if (this.token_metadata_by_id) {
      this.token_metadata_by_id.set(
        tmp_token_id,
        new TokenMetadata(
          repeat("a", 64),
          repeat("a", 64),
          repeat("a", 64),
          repeat("a", 64),
          1n,
          null,
          null,
          null,
          null,
          null,
          null,
          null
        )
      );
    }

    if (this.tokens_per_owner) {
      const u = new UnorderedSet<AccountId>(
        new TokensPerOwner(
          encUint8Array(near.sha256(bytes(tmp_owner_id)))
        ).into_storage_key()
      );
      u.set(tmp_token_id);
      this.tokens_per_owner.set(tmp_owner_id, u);
    }
    if (this.approvals_by_id) {
      const approvals = {};
      approvals[tmp_owner_id] = 1n;
      this.approvals_by_id.set(tmp_token_id, approvals);
    }
    if (this.next_approval_id_by_id) {
      this.next_approval_id_by_id.set(tmp_token_id, 1n);
    }

    // 2. see how much space it took
    this.extra_storage_in_bytes_per_token =
      near.storageUsage() - initial_storage_usage;

    // 3. roll it all back
    if (this.next_approval_id_by_id) {
      this.next_approval_id_by_id.remove(tmp_token_id);
    }
    if (this.approvals_by_id) {
      this.approvals_by_id.remove(tmp_token_id);
    }
    if (this.tokens_per_owner) {
      const u = this.tokens_per_owner.remove(tmp_owner_id, {
        reconstructor: UnorderedSet.reconstruct,
      });
      u.remove(tmp_token_id);
    }
    if (this.token_metadata_by_id) {
      this.token_metadata_by_id.remove(tmp_token_id);
    }
    this.owner_by_id.remove(tmp_token_id);
  }

  nft_total_supply(): number {
    return this.owner_by_id.length;
  }
  private enum_get_token(owner_id: AccountId, token_id: TokenId): Token {
    const metadata = this.token_metadata_by_id.get(token_id, {
      reconstructor: TokenMetadata.reconstruct,
    });
    const approved_account_ids = this.approvals_by_id.get(token_id, {
      defaultValue: {},
    });
    return new Token(token_id, owner_id, metadata, approved_account_ids);
  }

  nft_tokens({
    from_index,
    limit,
  }: {
    from_index?: number;
    limit?: number;
  }): Token[] {
    const start_index = from_index === undefined ? 0 : from_index;
    assert(
      this.owner_by_id.length >= start_index,
      "Out of bounds, please use a smaller from_index."
    );
    let l = limit === undefined ? 2 ** 32 : limit;
    assert(l > 0, "limit must be greater than 0.");
    l = Math.min(l, this.owner_by_id.length - start_index);
    const ret: Token[] = [];
    for (let i = start_index; i < start_index + l; i++) {
      const token_id = this.owner_by_id.keys.get(i);
      const owner_id = this.owner_by_id.get(token_id);
      ret.push(this.enum_get_token(owner_id, token_id));
    }
    return ret;
  }

  nft_supply_for_owner({ account_id }: { account_id: AccountId }): number {
    const tokens_per_owner = this.tokens_per_owner;
    assert(
      tokens_per_owner !== null,
      "Could not find tokens_per_owner when calling a method on the enumeration standard."
    );

    const account_tokens = tokens_per_owner.get(account_id, {
      reconstructor: UnorderedSet.reconstruct,
    });
    return account_tokens === null ? 0 : account_tokens.length;
  }

  nft_tokens_for_owner({
    account_id,
    from_index,
    limit,
  }: {
    account_id: AccountId;
    from_index?: number;
    limit?: number;
  }): Token[] {
    const tokens_per_owner = this.tokens_per_owner;
    assert(
      tokens_per_owner !== undefined,
      "Could not find tokens_per_owner when calling a method on the enumeration standard."
    );
    const token_set = tokens_per_owner.get(account_id, {
      reconstructor: UnorderedSet.reconstruct,
    });
    assert(token_set !== null, "Token set is empty");

    const start_index = from_index === undefined ? 0 : from_index;
    assert(
      token_set.length >= start_index,
      "Out of bounds, please use a smaller from_index."
    );
    let l = limit === undefined ? 2 ** 32 : limit;
    assert(l > 0, "limit must be greater than 0.");
    l = Math.min(l, token_set.length - start_index);

    const ret: Token[] = [];
    for (let i = start_index; i < start_index + l; i++) {
      const token_id = token_set.elements.get(i);
      const owner_id = this.owner_by_id.get(token_id);
      ret.push(this.enum_get_token(owner_id, token_id));
    }
    return ret;
  }

  nft_approve({
    token_id,
    account_id,
    msg,
  }: {
    token_id: TokenId;
    account_id: AccountId;
    msg: string;
  }): NearPromise {
    assert_at_least_one_yocto();
    if (this.approvals_by_id === null) {
      throw new Error("NFT does not support Approval Management");
    }
    const approvals_by_id = this.approvals_by_id;
    const owner_id = expect_token_found(this.owner_by_id.get(token_id));

    assert(
      near.predecessorAccountId() === owner_id,
      "Predecessor must be token owner."
    );

    const next_approval_id_by_id = expect_approval(this.next_approval_id_by_id);
    const approved_account_ids = approvals_by_id.get(token_id) ?? {};
    const approval_id = next_approval_id_by_id.get(token_id) ?? 1n;
    const old_approved_account_ids_size =
      serialize(approved_account_ids).length;
    approved_account_ids[account_id] = approval_id;
    const new_approved_account_ids_size =
      serialize(approved_account_ids).length;

    approvals_by_id.set(token_id, approved_account_ids);

    next_approval_id_by_id.set(token_id, approval_id + 1n);

    const storage_used =
      new_approved_account_ids_size - old_approved_account_ids_size;
    refund_deposit(BigInt(storage_used));

    if (msg) {
      return NearPromise.new(account_id).functionCall(
        "nft_on_approve",
        serialize({ token_id, owner_id, approval_id, msg }),
        0n,
        near.prepaidGas() - GAS_FOR_NFT_APPROVE
      );
    }
    return null;
  }

  nft_revoke({
    token_id,
    account_id,
  }: {
    token_id: TokenId;
    account_id: AccountId;
  }) {
    assert_one_yocto();
    if (this.approvals_by_id === null) {
      throw new Error("NFT does not support Approval Management");
    }
    const approvals_by_id = this.approvals_by_id;
    const owner_id = expect_token_found(this.owner_by_id.get(token_id));

    const predecessorAccountId = near.predecessorAccountId();
    assert(
      predecessorAccountId === owner_id,
      "Predecessor must be token owner."
    );

    const approved_account_ids = approvals_by_id.get(token_id);
    const old_approved_account_ids_size =
      serialize(approved_account_ids).length;
    let new_approved_account_ids_size;

    if (approved_account_ids[account_id]) {
      delete approved_account_ids[account_id];
      if (Object.keys(approved_account_ids).length === 0) {
        approvals_by_id.remove(token_id);
        new_approved_account_ids_size = serialize(approved_account_ids).length;
      } else {
        approvals_by_id.set(token_id, approved_account_ids);
        new_approved_account_ids_size = 0;
      }
      refund_storage_deposit(
        predecessorAccountId,
        new_approved_account_ids_size - old_approved_account_ids_size
      );
    }
  }

  nft_revoke_all({ token_id }: { token_id: TokenId }) {
    assert_one_yocto();
    if (this.approvals_by_id === null) {
      throw new Error("NFT does not support Approval Management");
    }
    const approvals_by_id = this.approvals_by_id;
    const owner_id = expect_token_found(this.owner_by_id.get(token_id));

    const predecessorAccountId = near.predecessorAccountId();
    assert(
      predecessorAccountId === owner_id,
      "Predecessor must be token owner."
    );

    const approved_account_ids = approvals_by_id.get(token_id);
    if (approved_account_ids) {
      refund_storage_deposit(
        predecessorAccountId,
        serialize(approved_account_ids).length
      );

      approvals_by_id.remove(token_id);
    }
  }

  static reconstruct(data: NonFungibleToken): NonFungibleToken {
    const ret = new NonFungibleToken();
    Object.assign(ret, data);
    ret.owner_by_id = UnorderedMap.reconstruct(ret.owner_by_id);
    if (ret.token_metadata_by_id) {
      ret.token_metadata_by_id = LookupMap.reconstruct(
        ret.token_metadata_by_id
      );
    }
    if (ret.tokens_per_owner) {
      ret.tokens_per_owner = LookupMap.reconstruct(ret.tokens_per_owner);
    }
    if (ret.approvals_by_id) {
      ret.approvals_by_id = LookupMap.reconstruct(ret.approvals_by_id);
    }
    if (ret.next_approval_id_by_id) {
      ret.next_approval_id_by_id = LookupMap.reconstruct(
        ret.next_approval_id_by_id
      );
    }
    return ret;
  }
}

export class TokensPerOwner implements IntoStorageKey {
  constructor(public account_hash: Uint8Array) {}

  into_storage_key(): string {
    return "\x00" + str(this.account_hash);
  }
}
