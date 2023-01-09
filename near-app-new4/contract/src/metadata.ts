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

/** This spec can be treated like a version of the standard. */
export const NFT_METADATA_SPEC = "nft-1.0.0";

export class TokenMetadata {
  // title: string | null; // ex. "Arch Nemesis: Mail Carrier" or "Parcel #5055"
  // description: string | null; // free-form description
  // media: string | null; // URL to associated media, preferably to decentralized, content-addressed storage
  // media_hash: string | null; // Base64-encoded sha256 hash of content referenced by the `media` field. Required if `media` is included.
  // copies: number | null; // number of copies of this set of metadata in existence when token was minted.
  // issued_at: number | null; // When token was issued or minted, Unix epoch in milliseconds
  // expires_at: number | null; // When token expires, Unix epoch in milliseconds
  // starts_at: number | null; // When token starts being valid, Unix epoch in milliseconds
  // updated_at: number | null; // When token was last updated, Unix epoch in milliseconds
  // extra: string | null; // anything extra the NFT wants to store on-chain. Can be stringified JSON.
  // reference: string | null; // URL to an off-chain JSON file with more info.
  // reference_hash: string | null; // Base64-encoded sha256 hash of JSON from reference field. Required if `reference` is included.
  constructor(
    public title: string,
    public description: string,
    public media: string,
    public media_hash: string,
    public copies: bigint,
    public issued_at: number,
    public expires_at: number,
    public starts_at: number,
    public updated_at: number,
    public extra: string,
    public reference: string,
    public reference_hash: string
  ) {}

  assert_valid() {
    assert(
      (this.media != null) == (this.media_hash != null),
      "Media and media hash must be present"
    );
    if (this.media_hash != null) {
      assert(this.media_hash.length == 32, "Media hash has to be 32 bytes");
    }
    if (this.media_hash != null) {
      assert(this.media_hash.length == 32, "Media hash has to be 32 bytes");
    }
    assert(
      (this.reference != null) == (this.reference_hash != null),
      "Reference and reference hash must be present"
    );
    if (this.reference_hash != null) {
      assert(
        this.reference_hash.length == 32,
        "Reference hash has to be 32 bytes"
      );
    }
  }

  static reconstruct(data: TokenMetadata): TokenMetadata {
    return new TokenMetadata(
      data.title,
      data.description,
      data.media,
      data.media_hash,
      data.copies,
      data.issued_at,
      data.expires_at,
      data.starts_at,
      data.updated_at,
      data.extra,
      data.reference,
      data.reference_hash
    );
  }
}

/** Metadata for the NFT contract itself. */
export class NFTContractMetadata {
  public spec: string; // required, essentially a version like "nft-1.0.0"
  public name: string; // required, ex. "Mosaics"
  public symbol: string; // required, ex. "MOSIAC"
  public icon: string; // Data URL
  public base_uri: string; // Centralized gateway known to have reliable access to decentralized storage assets referenced by `reference` or `media` URLs
  public reference: string; // URL to a JSON file with more info
  public reference_hash: string; // Base64-encoded sha256 hash of JSON from reference field. Required if `reference` is included.

  constructor() {
    this.spec = NFT_METADATA_SPEC;
    this.name = "";
    this.symbol = "";
    this.icon = null;
    this.base_uri = null;
    this.reference = null;
    this.reference_hash = null;
  }

  init(
    spec: string,
    name: string,
    symbol: string,
    icon: string,
    base_uri: string,
    reference: string,
    reference_hash: string
  ) {
    this.spec = spec;
    this.name = name;
    this.symbol = symbol;
    this.icon = icon;
    this.base_uri = base_uri;
    this.reference = reference;
    this.reference_hash = reference_hash;
  }

  assert_valid() {
    //metadata version not valid.
    assert(this.spec == NFT_METADATA_SPEC, "Spec is not NFT metadata");
    assert(
      (this.reference != null) == (this.reference_hash != null),
      "Reference and reference hash must be present"
    );
    if (this.reference_hash != null) {
      assert(this.reference_hash.length == 32, "Hash has to be 32 bytes");
    }
  }

  static reconstruct(data: NFTContractMetadata): NFTContractMetadata {
    const metadata = new NFTContractMetadata();
    Object.assign(metadata, data);
    return metadata;
  }
}
