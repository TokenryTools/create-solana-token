// A small builder for the Metaplex Token Metadata "CreateV1" instruction, written
// with Kit codecs. It replaces the Metaplex Kit client, which depends on an older
// @solana/kit major and would install a second copy of Kit next to ours.
//
// Layout source: the generated CreateV1 client in
// https://github.com/metaplex-foundation/mpl-token-metadata (clients/js).
import {
  AccountRole,
  addEncoderSizePrefix,
  getAddressEncoder,
  getBooleanEncoder,
  getOptionEncoder,
  getProgramDerivedAddress,
  getStructEncoder,
  getU16Encoder,
  getU32Encoder,
  getU8Encoder,
  getUnitEncoder,
  getUtf8Encoder,
  type Address,
  type Instruction,
  type TransactionSigner,
} from '@solana/kit';
import { SYSTEM_PROGRAM_ADDRESS } from '@solana-program/system';
import { TOKEN_PROGRAM_ADDRESS } from '@solana-program/token';

export const TOKEN_METADATA_PROGRAM_ADDRESS =
  'metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s' as Address<'metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s'>;
const SYSVAR_INSTRUCTIONS_ADDRESS = 'Sysvar1nstructions1111111111111111111111111' as Address;

/** TokenStandard enum in Token Metadata. 2 = Fungible (a normal token with decimals). */
const TOKEN_STANDARD_FUNGIBLE = 2;

/** The metadata account is a PDA of ["metadata", program id, mint]. */
export async function findMetadataPda(mint: Address): Promise<Address> {
  const addressEncoder = getAddressEncoder();
  const [pda] = await getProgramDerivedAddress({
    programAddress: TOKEN_METADATA_PROGRAM_ADDRESS,
    seeds: ['metadata', addressEncoder.encode(TOKEN_METADATA_PROGRAM_ADDRESS), addressEncoder.encode(mint)],
  });
  return pda;
}

// Borsh string: u32 little-endian length, then UTF-8 bytes.
const borshString = () => addEncoderSizePrefix(getUtf8Encoder(), getU32Encoder());
// Fields this tool always leaves empty (collection, uses, collectionDetails,
// printSupply). A None option is a single 0 byte whatever its inner type, so the
// inner encoder is never used.
const alwaysNone = () => getOptionEncoder(getUnitEncoder());

const createV1DataEncoder = getStructEncoder([
  ['discriminator', getU8Encoder()], // 42 = Create
  ['createV1Discriminator', getU8Encoder()], // 0 = V1
  ['name', borshString()],
  ['symbol', borshString()],
  ['uri', borshString()],
  ['sellerFeeBasisPoints', getU16Encoder()],
  ['creators', alwaysNone()],
  ['primarySaleHappened', getBooleanEncoder()],
  ['isMutable', getBooleanEncoder()],
  ['tokenStandard', getU8Encoder()],
  ['collection', alwaysNone()],
  ['uses', alwaysNone()],
  ['collectionDetails', alwaysNone()],
  ['ruleSet', getOptionEncoder(getAddressEncoder())],
  ['decimals', getOptionEncoder(getU8Encoder())],
  ['printSupply', alwaysNone()],
]);

export type CreateFungibleMetadataInput = {
  metadata: Address;
  /** An existing, initialized mint owned by the classic Token program. */
  mint: Address;
  /** The mint authority. It signs and also becomes the metadata update authority. */
  authority: TransactionSigner;
  payer: TransactionSigner;
  name: string;
  symbol: string;
  uri: string;
  decimals: number;
};

/**
 * CreateV1 for a fungible token whose mint already exists. The metadata stays
 * mutable and the authority becomes its update authority.
 */
export function getCreateFungibleMetadataInstruction(input: CreateFungibleMetadataInput): Instruction {
  const data = createV1DataEncoder.encode({
    discriminator: 42,
    createV1Discriminator: 0,
    name: input.name,
    symbol: input.symbol,
    uri: input.uri,
    sellerFeeBasisPoints: 0,
    creators: null,
    primarySaleHappened: false,
    isMutable: true,
    tokenStandard: TOKEN_STANDARD_FUNGIBLE,
    collection: null,
    uses: null,
    collectionDetails: null,
    ruleSet: null,
    decimals: input.decimals,
    printSupply: null,
  });

  return {
    programAddress: TOKEN_METADATA_PROGRAM_ADDRESS,
    accounts: [
      { address: input.metadata, role: AccountRole.WRITABLE },
      // Master edition: only for NFTs. An unused optional account is passed as the program id.
      { address: TOKEN_METADATA_PROGRAM_ADDRESS, role: AccountRole.READONLY },
      { address: input.mint, role: AccountRole.WRITABLE },
      { address: input.authority.address, role: AccountRole.READONLY_SIGNER, signer: input.authority },
      { address: input.payer.address, role: AccountRole.WRITABLE_SIGNER, signer: input.payer },
      { address: input.authority.address, role: AccountRole.READONLY_SIGNER, signer: input.authority }, // update authority
      { address: SYSTEM_PROGRAM_ADDRESS, role: AccountRole.READONLY },
      { address: SYSVAR_INSTRUCTIONS_ADDRESS, role: AccountRole.READONLY },
      { address: TOKEN_PROGRAM_ADDRESS, role: AccountRole.READONLY },
    ],
    data,
  } as Instruction;
}
