# LGOIMA Redaction Taxonomy for Local Government AI Redaction Tools

**Version:** 2026-04-13  
**Jurisdiction:** New Zealand  
**Primary statute:** *Local Government Official Information and Meetings Act 1987 (LGOIMA)*  
**Purpose:** A practical, legally anchored taxonomy to support detection, classification, redaction recommendation, workflow routing, quality assurance, and test-pack design for local government records.

---

## 1. Purpose of this document

This document provides a **detailed redaction taxonomy** for information held by local authorities in New Zealand under LGOIMA. It is designed for:

- AI redaction tool design
- rules-engine development
- model labelling and supervised training
- QA and benchmark pack creation
- council redaction playbooks
- human reviewer guidance
- release-letter and decision-log support

It deliberately separates:

1. **content elements** that a model can detect  
2. **legal grounds** that may justify withholding or redaction  
3. **workflow decisions** that are not strictly redactions but matter in LGOIMA handling

That separation is critical. A phone number, home address, bank account number, NHI, or person’s name is **not** itself the legal ground. It is usually an **indicator** of one or more legal interests, such as privacy, safety, law enforcement sensitivity, confidentiality, or harassment risk.

---

## 2. Legislative architecture at a glance

LGOIMA operates on a **principle of availability**: official information should be made available unless there is good reason to withhold it.

For redaction tooling, the most important legal buckets are:

- **Section 6** — conclusive reasons for withholding official information  
- **Section 7** — other reasons for withholding official information, subject to the **public interest test**  
- **Section 8** — neither confirm nor deny in limited circumstances  
- **Section 10(1A)** — where a request by a natural person is for official information about themselves, it is treated as a **Privacy Act 2020** request  
- **Section 15–16** — mechanics of release, including release by excerpt or with deletions  
- **Section 17** — refusal grounds / administrative reasons for refusing a request  
- **Section 17A–17B** — substantial collation/research and the duty to consider consulting the requester before refusing on those grounds

---

## 3. Core design principle for an AI redaction engine

A sound engine should not stop at:

> “What entities exist in this document?”

It should also ask:

> “What protected interest would be harmed by release?”

That means every redaction recommendation should ideally store:

- extracted text span
- document location
- entity type
- contextual cues
- proposed LGOIMA ground
- confidence score
- whether public-interest balancing is required
- whether legal review is required
- whether the case is a release-by-excerpt / summary candidate
- whether section 8 or section 17 workflow routing may apply

---

## 4. The three-layer taxonomy model

### Layer A — detectable content
This is what the model sees directly.

Examples:
- personal names
- email addresses
- phone numbers
- home addresses
- IRD numbers
- bank account numbers
- NHI numbers
- passport numbers
- driver licence numbers
- vehicle registration numbers
- signatures
- witness statements
- GPS coordinates
- legal advice labels
- pricing schedules
- margin data
- evaluation commentary
- draft negotiation positions
- disciplinary allegations
- medical notes

### Layer B — legal withholding interest
This is the legal reason that may justify withholding under LGOIMA.

Examples:
- privacy
- trade secret
- commercial prejudice
- obligation of confidence
- public safety measures
- anti-loss / anti-fraud controls
- free and frank opinions
- protection from harassment
- legal professional privilege
- council commercial activities
- negotiations
- improper gain / improper advantage
- maintenance of the law
- safety of a person
- tikanga Māori / wāhi tapu sensitivity

### Layer C — workflow / response-routing category
This is where the request or material may need special handling, even if not a classic “redaction reason”.

Examples:
- public interest balancing required
- neither confirm nor deny candidate
- Privacy Act routing candidate
- transfer candidate
- information not held
- substantial collation/research
- already publicly available
- refusal-ground candidate
- excerpt / summary release candidate

---

## 5. Detailed LGOIMA legal taxonomy

## 5.1 Section 6 — conclusive reasons for withholding

Section 6 grounds are **conclusive**. If one applies, there is no balancing exercise equivalent to section 7(1).

### 5.1.1 Security or defence of New Zealand / international relations
**Statutory anchor:** section 6(a)

**Plain-English reason**  
Information may be withheld where release would be likely to prejudice the security or defence of New Zealand, or the international relations of the Government of New Zealand.

**Relevance to local government**  
This is rare in ordinary council operations, but not impossible. It can arise in:
- critical infrastructure security
- major port or airport coordination
- emergency management
- cyber resilience documents
- sensitive inter-agency resilience plans
- foreign-government confidence material held as part of a cross-border function

**Likely indicators**
- critical infrastructure diagrams
- restricted security architecture
- emergency escalation paths
- vulnerabilities in water, transport, or energy systems
- system topology details
- site-access credentials or controls
- intelligence-fed threat assessments

**Typical local government document types**
- critical infrastructure security plans
- emergency coordination papers
- cyber response plans
- resilience architecture documents
- protected site-security assessments

**Synthetic test data ideas**
- SCADA access architecture
- unpatched control-system weaknesses
- restricted contact trees
- emergency muster vulnerabilities
- internal threat matrix for critical assets

**Model caution**  
Do not over-trigger on the word “security”. Many ordinary documents refer to physical security or safety in a non-section-6 sense. Context matters.

---

### 5.1.2 Information entrusted in confidence by another government or international organisation
**Statutory anchor:** section 6(b)

**Plain-English reason**  
Information may be withheld where release would prejudice the entrusting of information to New Zealand on a basis of confidence by:
- another government or its agency; or
- an international organisation.

**Relevance to local government**  
Uncommon, but plausible in:
- port security
- emergency management coordination
- civil defence
- public health event coordination involving overseas agencies
- international sister-city, disaster response, or specialist infrastructure collaboration where confidential briefings are shared

**Likely indicators**
- “provided in confidence”
- foreign government logos or headers
- “not for onward release”
- international organisation briefing notes
- restricted international liaison emails

**Typical document types**
- foreign-agency briefings
- port-security intelligence notes
- international emergency coordination records

**Synthetic test data ideas**
- confidential port-security advisory from overseas authority
- international hazard monitoring briefing
- embargoed resilience note from an international body

---

### 5.1.3 Maintenance of the law
**Statutory anchor:** section 6(c)

**Plain-English reason**  
Information may be withheld where release would be likely to prejudice the maintenance of the law, including prevention, investigation, and detection of offences, and the right to a fair trial.

**Relevance to local government**  
This is highly relevant. It commonly arises in:
- dog control investigations
- bylaw enforcement
- fraud inquiries
- building compliance enforcement
- health and safety investigations
- prosecutions
- witness handling
- investigative methods

**Likely indicators**
- active investigation notes
- witness identities
- surveillance details
- interview plans
- evidence schedules
- prosecution strategy
- enforcement trigger rules
- covert or semi-covert processes
- references to evidential sufficiency or legal vulnerabilities

**Typical document types**
- animal control files
- noise-control enforcement files
- parking enforcement investigations
- rates fraud investigations
- building compliance prosecution bundles
- CCTV extraction notes
- officer notebooks

**Synthetic test data ideas**
- witness phone numbers and addresses
- planned interview sequence
- surveillance observations
- evidence matrix
- prosecution readiness assessment
- internal note on likely defence vulnerabilities

**Model caution**  
Do not confuse general “complaint handling” with section 6(c). The prejudice must be real and linked to maintenance of the law or fair-trial concerns.

---

### 5.1.4 Safety of any person
**Statutory anchor:** section 6(d)

**Plain-English reason**  
Information may be withheld where release would be likely to endanger the safety of any person.

**Relevance to local government**  
Very relevant in:
- contentious enforcement matters
- family violence-linked complaints
- neighbour disputes
- dangerous dog files
- complainant-sensitive housing matters
- staff safety cases
- intimidation scenarios

**Likely indicators**
- restraining order references
- “do not disclose address”
- safe-house details
- staff threat reports
- witness protection concerns
- complaint retaliation concerns
- vulnerable person case notes

**Typical document types**
- housing assistance files
- enforcement files
- neighbourhood complaint files
- dog attack records
- staff incident reports
- legal dispute files

**Synthetic test data ideas**
- hidden address for victim/survivor
- threatened officer roster
- witness location details
- emergency contact information
- concealed workplace access instructions

**Model caution**  
This ground may overlap with privacy, but is stronger and more specific. A person’s name or address may engage section 6(d) where simple privacy analysis is not enough.

---

## 5.2 Section 7 — other reasons for withholding, subject to public interest balancing

Section 7 is where most operational redaction work happens. A section 7 ground only provides good reason for withholding if:
1. the interest in section 7(2) applies; and
2. the need to withhold is **not outweighed** by countervailing public-interest considerations.

### 5.2.1 Privacy of natural persons
**Statutory anchor:** section 7(2)(a)

**Plain-English reason**  
Protect the privacy of natural persons, including deceased natural persons.

**This is the single most common redaction ground in local government.**

**Likely indicators**
- names of private individuals
- home addresses
- personal email addresses
- personal phone numbers
- dates of birth
- NHI numbers
- IRD numbers
- bank details
- passport numbers
- driver licence details
- dependent / family details
- health information
- complaint details
- personal photographs
- signatures

**Typical document types**
- service requests
- housing and hardship applications
- dog control records
- customer complaints
- LIM-related correspondence with individuals
- burial/cemetery records
- grant applications
- rates remission applications
- HR and welfare-adjacent files

**Synthetic test data ideas**
- full identity blocks
- family composition notes
- medical letter excerpts
- support needs
- emergency contacts
- personal bank account details
- vehicle registrations linked to natural persons

**Sub-categories worth modelling**
- identity information
- contact information
- government-issued identifiers
- health information
- family/whānau details
- financial information
- sensitive complaint participation
- personal image / signature

**Model caution**  
Not every name is private in the same way. Councillors, senior staff, contractors, and statutory decision-makers may have a reduced expectation of privacy in some contexts.

---

### 5.2.2 Trade secret
**Statutory anchor:** section 7(2)(b)(i)

**Plain-English reason**  
Protect information where release would disclose a trade secret.

**Relevance**
Narrower than “commercial sensitivity”. This should be reserved for genuine trade-secret type material.

**Likely indicators**
- non-public formulas
- proprietary methods
- unique technical process detail
- confidential manufacturing or software method
- source methodology that creates competitive advantage

**Typical document types**
- supplier technical annexes
- proprietary software proposals
- infrastructure performance algorithms
- specialist engineering methods

**Synthetic test data ideas**
- proprietary treatment-process formula
- software model architecture presented as confidential
- unique optimisation method in bid submission

**Model caution**  
Do not use “trade secret” as a catch-all for pricing. Most pricing belongs under commercial prejudice, not trade secret.

---

### 5.2.3 Commercial prejudice
**Statutory anchor:** section 7(2)(b)(ii)

**Plain-English reason**  
Protect information where release would likely unreasonably prejudice the commercial position of the person who supplied the information or who is the subject of the information.

**Relevance**
Extremely common in procurement, tendering, development, infrastructure, and supplier engagement.

**Likely indicators**
- pricing schedules
- rate cards
- discount structures
- margin assumptions
- customer lists
- deal terms
- commercial strategy
- confidential financial forecasts
- volume commitments
- supplier capability gaps
- non-public subcontracting terms

**Typical document types**
- tenders
- RFP responses
- evaluation workbooks
- supplier correspondence
- invoices with detailed commercial structure
- developer commercial submissions

**Synthetic test data ideas**
- bidder price breakdown by work package
- support margin assumptions
- floor price and walk-away price
- confidential revenue model
- market share assumptions

**Model caution**  
The statute uses “unreasonably prejudice”. The model should not assume that every commercial reference is automatically redactable.

---

### 5.2.4 Resource-management tikanga Māori / wāhi tapu sensitivity
**Statutory anchor:** section 7(2)(ba)

**Plain-English reason**  
In resource consent, water conservation order, designation, or heritage-order contexts, information may be withheld to avoid serious offence to tikanga Māori or disclosure of the location of wāhi tapu.

**Relevance**
Very important in planning, consenting, heritage, GIS, and archaeological contexts.

**Likely indicators**
- exact site coordinates
- maps marking sensitive cultural sites
- references to wāhi tapu
- iwi / hapū sensitivity comments
- archaeological reports with precise location data
- restricted cultural narratives

**Typical document types**
- resource consent files
- cultural impact assessments
- GIS maps
- archaeological reports
- planning advice
- notified consent submissions

**Synthetic test data ideas**
- GIS layer with exact protected coordinates
- report appendix naming exact sacred site location
- cultural impact statement with sensitive location markers

**Model caution**  
This is highly contextual. A reference to tikanga Māori is not itself enough. The concern is serious offence or disclosure of wāhi tapu location in the specified consenting context.

---

### 5.2.5 Obligation of confidence / compelled information
**Statutory anchor:** section 7(2)(c)

This ground has two limbs.

#### (i) Prejudice to future supply
Protect information subject to an obligation of confidence, or information that a person has been or could be compelled to provide under enactment, where release would likely prejudice future supply of similar information and it is in the public interest that such information continue to be supplied.

#### (ii) Damage to the public interest
Protect information where release would otherwise likely damage the public interest.

**Relevance**
Common in:
- complaint systems
- whistleblowing
- sensitive stakeholder submissions
- environmental reporting
- internal or external investigative cooperation
- protected disclosures
- trust-based community engagement

**Likely indicators**
- “in confidence”
- confidential witness statement
- “provided on the basis of confidentiality”
- investigative source material
- protected disclosure language
- sensitive community disclosure
- third-party submission given in reliance on confidence

**Typical document types**
- complaint files
- protected disclosure files
- environmental incident reports
- neighbour dispute records
- community safety submissions
- stakeholder consultation notes
- internal investigation interview material

**Synthetic test data ideas**
- confidential complainant narrative
- neighbour report with fear-of-retaliation note
- whistleblower email chain
- confidential NGO stakeholder submission
- controlled source statement

**Model caution**
The model should distinguish:
- information merely labelled confidential, and
- information that is genuinely subject to an obligation of confidence with likely prejudice from release.

---

### 5.2.6 Measures protecting public health or safety
**Statutory anchor:** section 7(2)(d)

**Plain-English reason**  
Avoid prejudice to measures protecting the health or safety of members of the public.

**Relevance**
Strongly relevant to:
- water treatment
- environmental health
- emergency management
- transport safety
- hazardous substance management
- crowd safety
- compliance and inspection systems

**Likely indicators**
- alarm thresholds
- safety-control settings
- protective procedure steps
- emergency response timings
- contamination response logic
- site vulnerability references
- restricted health/safety control plans

**Typical document types**
- infrastructure operating procedures
- emergency response manuals
- public venue safety plans
- contamination response plans
- water network safety documents

**Synthetic test data ideas**
- chlorine monitoring thresholds
- access bypass procedure for safety systems
- emergency shutoff sequence
- public-event evacuation control details

**Model caution**
This is about prejudice to **measures** protecting the public, not simply any health-related content.

---

### 5.2.7 Measures preventing or mitigating material loss to members of the public
**Statutory anchor:** section 7(2)(e)

**Plain-English reason**  
Avoid prejudice to measures that prevent or mitigate material loss to members of the public.

**Relevance**
This can capture:
- anti-fraud controls
- theft prevention logic
- cyber and financial control structures
- insurance or asset protection measures
- payment or revenue-protection controls

**Likely indicators**
- control weaknesses
- anti-fraud trigger rules
- payment validation logic
- system exceptions used to detect theft or misuse
- audit flags
- fraud scoring thresholds
- revenue assurance controls

**Typical document types**
- fraud-control manuals
- cyber hardening notes
- asset-security procedures
- audit control memos
- payment exception reports

**Synthetic test data ideas**
- fraud trigger list
- internal thresholds for anomaly detection
- security review of billing override process
- control-gap register

---

### 5.2.8 Free and frank expression of opinions
**Statutory anchor:** section 7(2)(f)(i)

**Plain-English reason**  
Maintain the effective conduct of public affairs through the free and frank expression of opinions by, between, or to members, officers, or employees of a local authority in the course of duty.

**Relevance**
Very common in:
- internal advice
- draft recommendations
- challenge notes
- risk reviews
- peer review comments
- executive briefings
- policy options

**Likely indicators**
- candid evaluative language
- frank criticism
- recommendation rankings
- internal challenge notes
- “option 3 is likely to fail”
- reputational-risk commentary
- draft advice before decision

**Typical document types**
- internal emails
- draft reports
- governance advice
- executive briefings
- review comments
- procurement panel commentary
- policy options papers

**Synthetic test data ideas**
- officer-to-officer critique of proposal
- draft recommendation against proceeding
- candid comments on supplier weakness
- internal risk appetite discussion

**Model caution**
Do not treat every opinion as “free and frank”. The key issue is whether withholding is necessary to maintain effective conduct of public affairs.

---

### 5.2.9 Protection from improper pressure or harassment
**Statutory anchor:** section 7(2)(f)(ii)

**Plain-English reason**  
Protect members, officers, employees, and other persons from improper pressure or harassment.

**Relevance**
Highly relevant in polarised or contentious issues:
- controversial bylaw disputes
- aggressive complainants
- dog control
- parking / compliance disputes
- neighbourhood conflict
- staff-facing hostility
- politically heated issues

**Likely indicators**
- abusive language history
- doxxing concerns
- staff-targeting history
- threat reports
- instructions not to disclose direct contact details
- staff identity in contentious matters

**Typical document types**
- enforcement files
- correspondence logs
- staff incident reports
- contentious policy files
- complaint handling notes

**Synthetic test data ideas**
- direct line numbers of officers facing hostility
- named junior staff in contentious case
- internal safety note re public harassment

**Model caution**
This is distinct from free and frank. It is about protecting people from improper pressure or harassment.

---

### 5.2.10 Legal professional privilege
**Statutory anchor:** section 7(2)(g)

**Plain-English reason**  
Maintain legal professional privilege.

**Relevance**
A major category in:
- litigation
- threatened litigation
- employment disputes
- contract disputes
- regulatory interpretation
- governance advice
- procurement challenge risk
- statutory interpretation advice

**Likely indicators**
- “privileged and confidential”
- lawyer-client communications
- legal advice memoranda
- litigation strategy
- counsel opinions
- advice requests to solicitors
- annotated draft agreements with legal advice

**Typical document types**
- legal memos
- solicitor emails
- litigation risk notes
- governance advice
- external counsel opinions
- board reports attaching legal advice

**Synthetic test data ideas**
- memorandum from external law firm
- advice on likelihood of judicial review
- employment dismissal risk analysis
- privilege-labelled email chain

**Sub-types worth modelling**
- solicitor-client privilege
- litigation privilege
- waiver risk indicators
- mixed business/legal communications

**Model caution**
Privilege is context-heavy. Not every document touching a lawyer is privileged. The communication must meet the legal test for privilege.

---

### 5.2.11 Local authority commercial activities
**Statutory anchor:** section 7(2)(h)

**Plain-English reason**  
Enable the local authority to carry out, without prejudice or disadvantage, commercial activities.

**Relevance**
Different from third-party commercial prejudice. This protects the **council’s own** commercial position.

**Likely indicators**
- council pricing strategy
- lease strategy
- reserve prices
- confidential development economics
- event venue commercial modelling
- rates or fee pricing under negotiation
- CCO trading information

**Typical document types**
- property development files
- lease negotiations
- event/convention venue pricing
- council-owned utility commercial papers
- airport/port or venue commercial planning

**Synthetic test data ideas**
- confidential lease range
- internal reserve price setting
- commercial occupancy assumptions
- upcoming market-entry strategy

**Model caution**
This ground is for the local authority’s own activities, not just any commercial information in council hands.

---

### 5.2.12 Negotiations
**Statutory anchor:** section 7(2)(i)

**Plain-English reason**  
Enable the local authority to carry on, without prejudice or disadvantage, negotiations, including commercial and industrial negotiations.

**Relevance**
Very common in:
- property acquisition
- settlements
- supplier negotiations
- employment negotiations
- mediation
- development agreements
- land swaps
- infrastructure cost sharing

**Likely indicators**
- walk-away position
- negotiation fallback
- red-line terms
- settlement range
- BATNA-type reasoning
- unaccepted offers
- bargaining sequence
- industrial bargaining positions

**Typical document types**
- acquisition files
- settlement correspondence
- employment matter notes
- property development term sheets
- mediation briefs

**Synthetic test data ideas**
- internal note stating preferred settlement range
- undisclosed reserve for acquisition
- fallback contracting position
- internal negotiation strategy matrix

---

### 5.2.13 Improper gain or improper advantage
**Statutory anchor:** section 7(2)(j)

**Plain-English reason**  
Prevent the disclosure or use of official information for improper gain or improper advantage.

**Relevance**
Particularly useful in:
- tenders
- property acquisition
- enforcement timing
- valuation assumptions
- strategic infrastructure planning
- market-sensitive release
- gaming of council processes

**Likely indicators**
- reserve prices
- timing of enforcement activity
- non-public valuation assumptions
- procurement scoring methodology likely to be gamed
- strategic acquisition timing
- unpublished route or site selection analysis

**Typical document types**
- procurement guidance
- property files
- enforcement scheduling
- valuation workbooks
- acquisition planning papers

**Synthetic test data ideas**
- unpublished procurement scorecard weighting logic
- land acquisition target ranking
- internal file on timing of enforcement blitz
- valuation assumptions for pre-purchase strategy

**Model caution**
This ground often overlaps with commercial, negotiation, or law-enforcement concerns. Multi-labelling may be needed.

---

## 5.3 Section 8 — neither confirm nor deny

**Statutory anchor:** section 8

**Plain-English reason**  
Where a request relates to information to which section 6 or section 7(2)(b) applies, or would apply if it existed, the local authority may neither confirm nor deny the existence or non-existence of that information if confirming or denying would itself prejudice the protected interest.

**Why this matters for an AI workflow**
This is not a redaction in the ordinary sense. It is a **response mode**. A document-classifier or request-triage system should still flag possible NCND scenarios.

**High-value use cases**
- “Do you hold complaints about Company X tender misconduct?”
- “Do you have any file about planned acquisition of 23 Harbour Road?”
- “Do you hold investigation material about my neighbour?”
- “Do you hold records of a confidential supplier misconduct allegation?”

**NCND trigger cues**
- existence itself would signal investigation or commercial confidence
- requests about confidential commercial intelligence
- requests that would expose enforcement focus
- requests about trade-secret-bearing material

**Important limitation**
Section 8 is confined to information to which **section 6** or **section 7(2)(b)** applies.

---

## 5.4 Section 10(1A) — requester’s own personal information

**Statutory anchor:** section 10(1A)

**Plain-English reason**  
A request by a natural person for official information about themselves is treated as a request under the Privacy Act 2020, not under Part 2 of LGOIMA.

**Why this matters**
Your workflow should identify:
- requests for “my file”
- requests for “all information you hold about me”
- requests from a person seeking their own complaint record, housing file, enforcement file, or correspondence history

**Redaction implication**
These requests may still require careful review and may still involve third-party redactions, but the **governing regime changes**.

**Good test prompts**
- “Please provide all records council holds about me relating to the noise complaint”
- “I want the inspection notes about my property”
- “Please send me my housing support file”
- “I want all emails mentioning me”

---

## 5.5 Section 15 and section 16 — release mechanics and deletions

### Section 15
Official information can be made available in several ways, including:
- inspection
- copy
- viewing/listening arrangements
- transcript
- excerpt or summary
- oral information

### Section 16
This is critical for redaction systems. A document may be released with **deletions**, provided the deleted information is information that could properly be withheld.

**Implication for AI tools**
A robust system should support:
- page-level release
- clause-level deletion
- cell-level spreadsheet deletion
- annexure exclusion
- excerpt-only release
- summary release recommendation

**Why this matters**
In practice, many council releases are not full grants or full refusals; they are:
- partial release
- release with redactions
- excerpt release
- schedule-only release
- summary release

---

## 5.6 Section 17 — refusal grounds / workflow grounds

Section 17 is not mainly about legal interests like privacy or privilege. It is largely about **administrative refusal** or response-routing.

### 5.6.1 One of the section 6, 7, or 8 grounds applies
**Statutory anchor:** section 17(a) and 17(b) logic in practice

Use where the agency refuses rather than partially releases.

**Model relevance**
If the tool concludes the entire record is withheld, it should suggest:
- whether partial release was considered
- whether section 16 deletions are feasible
- whether excerpt / summary is viable

---

### 5.6.2 Disclosure would be contrary to another enactment or constitute contempt
**Statutory anchor:** section 17(c)

**Examples**
- statutory secrecy
- court suppression
- non-publication orders
- tribunal constraints
- contempt risk

**Synthetic test data**
- suppressed witness identity
- sealed court document reference
- statutory prohibition note

---

### 5.6.3 Information is or will soon be publicly available
**Statutory anchor:** section 17(d)

**Examples**
- agenda already online
- adopted minutes published next week
- report on website
- annual plan data already published
- open-data set publicly downloadable

**Tool function**
Flag:
- already published URL candidate
- “refer to public source” response candidate
- duplicate request detection

---

### 5.6.4 Information not held / cannot be found
**Statutory anchor:** section 17(e)

**Examples**
- wrong agency
- no record exists
- destroyed under schedule
- not held by council
- not retained
- not locatable after reasonable steps

**Tool function**
Distinguish:
- not held
- not found
- likely held elsewhere
- transfer candidate under section 12

---

### 5.6.5 Substantial collation or research
**Statutory anchor:** section 17(f), supported by sections 17A and 17B

**Examples**
- “all emails about rates from the last 12 years”
- “every complaint about dogs in the district since 2010”
- “all records relating to consenting of coastal properties”

**Tool function**
Estimate:
- likely record volume
- mailbox count
- search breadth
- whether refinement assistance should be suggested

**Design note**
Before refusing under section 17(e) or (f), section 17B requires the local authority to consider whether consulting the requester would help remove the reason for refusal.

---

### 5.6.6 Requested information not held and no basis to believe another body holds it
**Workflow distinction**
Your engine should distinguish between:
- likely transfer candidate
- not-held/no-known-holder
- held by contractor or consultant on behalf question
- held by elected member privately vs held by council question

---

### 5.6.7 Frivolous, vexatious, or trivial
**Statutory anchor:** section 17(h)

**Examples**
- abusive repetitive requests
- trivial misuse of process
- serial harassment through requests
- circular repeated requests with no substantive change

**Tool function**
This should never be an automatic AI refusal. At most, it is a high-risk workflow flag for senior review.

---

## 6. Public interest balancing

For **section 7 grounds**, the public interest test is mandatory.

### 6.1 What the engine should do
Where a section 7 ground is triggered, the system should require:
- a public-interest review flag
- reviewer reasoning field
- optional public-interest factors
- decision note on whether public interest outweighs withholding

### 6.2 Typical public-interest factors
Examples may include:
- accountability for expenditure of public money
- transparency of procurement
- public safety failures
- environmental harm
- fairness of decision-making
- improper conduct by public officials
- systemic service failure
- democratic participation in major local decisions

### 6.3 Model design rule
Never let the AI label a section 7 ground as finally determinative without a public-interest review step.

---

## 7. Content-feature taxonomy for model detection

Below is a more implementation-friendly feature inventory.

## 7.1 Identity and contact features
- person_name
- preferred_name / alias
- title + surname combinations
- family member names
- email_address
- phone_number
- alternate_phone
- home_address
- postal_address
- geolocation / coordinates
- signature
- handwriting sample
- photo / headshot

## 7.2 Government and official identifiers
- IRD_number
- NHI_number
- passport_number
- driver_licence_number
- rates_account_number
- customer_reference_number
- case_number
- infringement_number
- prosecution_reference
- consent_reference
- LIM_reference

## 7.3 Financial features
- bank_account_number
- credit_card_last4
- invoice_amount
- pricing_schedule
- margin_percentage
- discount_tier
- lease_rate
- reserve_price
- settlement_range

## 7.4 Health and vulnerability features
- medical_condition
- medication_reference
- disability_reference
- NHI-linked health note
- mental_health_reference
- injury details
- vulnerability note
- emergency contact
- family violence indicator

## 7.5 Enforcement and investigation features
- complainant_identity
- witness_identity
- officer_identity
- surveillance_reference
- evidence_reference
- prosecution_assessment
- interview_plan
- enforcement_timing
- alert_trigger
- intelligence_marker

## 7.6 Commercial and procurement features
- supplier_name
- bidder_name
- unit_price
- total_price
- proprietary_method
- technical_secret
- cost_build_up
- margin
- capability_gap
- non_public_contract_term
- evaluation_comment
- negotiation_position

## 7.7 Legal features
- privileged_label
- legal_advice
- counsel_opinion
- litigation_risk
- settlement_strategy
- waiver_risk_indicator
- draft_pleading_reference

## 7.8 Cultural / site sensitivity features
- waahi_tapu_reference
- exact_sensitive_coordinate
- cultural_impact_note
- protected_site_map
- iwi_confidential_commentary

---

## 8. Recommended legal-label schema

A practical label set for an AI system is below.

### 8.1 Primary legal labels
- privacy
- trade_secret
- commercial_prejudice
- tikanga_maori_wahi_tapu
- confidence_prejudice_future_supply
- confidence_public_interest_damage
- public_health_safety_measures
- material_loss_prevention
- free_and_frank
- harassment_pressure
- legal_privilege
- council_commercial_activities
- negotiations
- improper_gain_advantage
- security_defence_international_relations
- confidential_info_from_other_governments
- maintenance_of_the_law
- safety_of_person

### 8.2 Workflow labels
- public_interest_review_required
- ncnd_candidate
- privacy_act_routing_candidate
- transfer_candidate
- section16_partial_release_candidate
- excerpt_or_summary_candidate
- already_publicly_available_candidate
- not_held_candidate
- substantial_collation_candidate
- vexatious_or_trivial_candidate
- further_human_review_required

### 8.3 Confidence bands
- high
- medium
- low
- ambiguous_context

---

## 9. Mapping the user’s existing characteristics to legal grounds

Below is a useful crosswalk from the characteristics you already listed.

| Characteristic | Usually an indicator of | Notes |
|---|---|---|
| Personal names | Privacy; safety; harassment; law enforcement | Context determines whether the name is actually sensitive |
| Phone numbers | Privacy; harassment; safety | Direct staff lines in contentious matters may engage harassment risk |
| Email addresses | Privacy; harassment; safety; commercial | Business emails may have weaker privacy claims than personal emails |
| Physical addresses | Privacy; safety; law enforcement | Home addresses can be especially sensitive |
| IRD numbers | Privacy | Often highly sensitive personal identifier |
| Bank account numbers | Privacy; commercial prejudice | Natural person account vs supplier account matters |
| NZ passport numbers | Privacy | High-risk identity data |
| Vehicle registration | Privacy; law enforcement; safety | Particularly sensitive when tied to complainants or witnesses |
| Commercial sensitivity | Trade secret; commercial prejudice; council commercial activities; negotiations; improper advantage | Needs sharper sub-labelling |
| Legal privilege | Legal professional privilege | Context-heavy; not all lawyer-related communications qualify |
| Free & frank opinions | Free and frank | Public-interest balancing always required |

---

## 10. High-value local government scenario taxonomy

## 10.1 Planning / resource consent
**Common grounds**
- privacy
- commercial prejudice
- negotiations
- tikanga Māori / wāhi tapu
- confidence
- free and frank

**Good embedded data**
- applicant personal details
- surveyor contacts
- consultant pricing
- archaeological site coordinates
- iwi comments
- internal planning advice
- neighbour submitter details

---

## 10.2 Dog control / animal management
**Common grounds**
- privacy
- maintenance of the law
- safety of person
- harassment
- confidence

**Good embedded data**
- complainant identities
- witness numbers
- dog owner address
- officer names
- seizure planning
- prosecution notes
- vehicle registration

---

## 10.3 Code compliance / building inspections
**Common grounds**
- privacy
- maintenance of the law
- public safety measures
- legal privilege
- free and frank

**Good embedded data**
- owner details
- inspection notes
- structural defect references
- enforcement timing
- legal advice
- emergency remediation triggers

---

## 10.4 Rates arrears / debt recovery
**Common grounds**
- privacy
- confidence
- negotiations
- legal privilege
- improper advantage

**Good embedded data**
- rates account details
- debtor addresses
- payment plans
- bank account details
- hardship narratives
- settlement options
- legal recovery advice

---

## 10.5 Procurement / supplier management
**Common grounds**
- trade secret
- commercial prejudice
- free and frank
- legal privilege
- negotiations
- improper advantage
- council commercial activities

**Good embedded data**
- bid prices
- scorecard notes
- moderation comments
- draft negotiation positions
- supplier IP
- legal challenge advice

---

## 10.6 Housing assistance / community support
**Common grounds**
- privacy
- safety of person
- health information
- confidence
- harassment

**Good embedded data**
- NHI numbers
- medical letters
- family violence indicators
- emergency accommodation location
- bank details
- support worker notes

---

## 10.7 HR / staff investigation
**Common grounds**
- privacy
- free and frank
- harassment
- legal privilege
- safety

**Good embedded data**
- interview notes
- disciplinary allegations
- wellbeing notes
- medical references
- legal advice
- staff contact details

---

## 10.8 Infrastructure / cyber / emergency management
**Common grounds**
- section 6 security/international relations in rare cases
- public safety measures
- material loss prevention
- legal privilege
- council commercial activities

**Good embedded data**
- access controls
- alarm thresholds
- outage escalation pathways
- cyber vulnerabilities
- privileged remediation advice

---

## 11. Redaction decision logic

A useful internal logic pattern is:

### Step 1 — detect content
Identify entities and sensitive spans.

### Step 2 — classify context
Identify whether the document is:
- complaint
- enforcement
- procurement
- legal
- planning
- HR
- housing
- infrastructure
- governance
- customer correspondence

### Step 3 — assign candidate legal grounds
Use the content plus context to propose 1–3 likely grounds.

### Step 4 — assess release shape
Recommend:
- no redaction
- local redaction only
- page-level removal
- annexure removal
- excerpt release
- summary release
- full withholding

### Step 5 — route workflow
Flag:
- public interest review
- Privacy Act routing
- NCND possibility
- legal review
- requester consultation candidate
- transfer candidate

---

## 12. Example machine-readable schema

```json
{
  "document_type": "procurement_evaluation",
  "excerpt": "Supplier B margin assumption remains 34% with a walk-away price of $412,000",
  "detected_content": [
    "pricing_schedule",
    "margin_percentage",
    "negotiation_position"
  ],
  "candidate_grounds": [
    {
      "label": "commercial_prejudice",
      "section": "LGOIMA s 7(2)(b)(ii)",
      "confidence": "high"
    },
    {
      "label": "negotiations",
      "section": "LGOIMA s 7(2)(i)",
      "confidence": "medium"
    },
    {
      "label": "improper_gain_advantage",
      "section": "LGOIMA s 7(2)(j)",
      "confidence": "medium"
    }
  ],
  "public_interest_review_required": true,
  "recommended_action": "redact_line",
  "human_review_priority": "high"
}
```

Another example:

```json
{
  "document_type": "housing_support_case_note",
  "excerpt": "NHI ABC1234. Client relocated to temporary accommodation at 17A Seabreeze Lane after threats from former partner.",
  "detected_content": [
    "NHI_number",
    "street_address",
    "safety_indicator",
    "family_violence_indicator"
  ],
  "candidate_grounds": [
    {
      "label": "privacy",
      "section": "LGOIMA s 7(2)(a)",
      "confidence": "high"
    },
    {
      "label": "safety_of_person",
      "section": "LGOIMA s 6(d)",
      "confidence": "high"
    }
  ],
  "public_interest_review_required": false,
  "recommended_action": "redact_paragraph",
  "human_review_priority": "urgent"
}
```

---

## 13. False positives and false negatives

## 13.1 Common false positives
- publicly known elected member names
- generic council email addresses
- public-facing phone numbers
- published report titles
- already public pricing or fees
- generic legal terms like “we may seek advice”
- ordinary draft comments that are not truly free and frank sensitive

## 13.2 Common false negatives
- contextual privilege without explicit labelling
- safety risks from seemingly ordinary addresses
- witness identities hidden inside narrative text
- confidential information lacking a confidentiality stamp
- commercially sensitive data embedded in spreadsheets or appendix tabs
- GPS coordinates within maps or screenshots
- wāhi tapu references embedded in GIS exports
- repeated identifiers across long threads

---

## 14. File-type guidance

Your test packs should include different file types because the same legal issue presents differently in each.

### Emails (.eml / .msg)
Useful for:
- free and frank
- harassment risk
- privilege
- negotiation history
- confidence markers
- messy forwarding chains

### Word documents (.docx)
Useful for:
- reports
- advice papers
- HR notes
- planning advice
- meeting minutes with tracked changes or comments

### PDFs
Useful for:
- release-ready documents
- scanned and image-based records
- signed agreements
- externally supplied reports

### Spreadsheets (.xlsx / .csv)
Useful for:
- pricing
- account lists
- contact registers
- hidden tabs
- comments
- formulas exposing logic

### Plain text / JSON / exports
Useful for:
- API-generated data
- logs
- raw case notes
- machine-readable schedules

### Image-only artefacts
Useful for:
- signatures
- screenshots
- maps
- forms
- handwritten annotations

---

## 15. Suggested benchmark categories for testing an AI redaction tool

A strong benchmark should test:

- short documents
- long documents
- repeated entities across documents
- mixed legal grounds in one paragraph
- overlapping grounds
- section 6 vs section 7 distinction
- public-interest review triggers
- spreadsheets
- messy forwarded email chains
- scanned PDFs
- OCR errors
- annotations/comments/metadata
- ambiguous entities
- already-public information
- near-miss false positives

---

## 16. Reviewer guidance prompts

Below are useful prompts for human reviewers.

### Privacy
- Is this information about a natural person?
- Is the expectation of privacy strong, moderate, or weak?
- Is the person acting in a public or official capacity?

### Commercial prejudice
- Whose commercial position is at risk?
- Is the prejudice likely and unreasonable?
- Is the information already in the market?

### Confidence
- Is there a real obligation of confidence?
- Would release prejudice future supply?
- Is continuing supply in the public interest?

### Free and frank
- Is the opinion genuinely candid and deliberative?
- Would release inhibit future candour?
- Is there a stronger public interest in accountability?

### Legal privilege
- Is this a confidential lawyer-client communication or litigation material?
- Has privilege been waived?
- Is the document mixed business/legal content?

### Safety
- Could release expose someone to harm, retaliation, or intimidation?
- Is a privacy redaction enough, or is safety the stronger ground?

### Negotiations
- Are negotiations active, pending, or realistically resumable?
- Would disclosure weaken the council’s bargaining position?

---

## 17. Practical redaction labels to adopt in a production system

A concise production label set could be:

### Entity labels
- PERSON
- EMAIL
- PHONE
- ADDRESS
- DOB
- NHI
- IRD
- BANK
- PASSPORT
- VEHICLE_REGO
- SIGNATURE
- HEALTH
- LEGAL_ADVICE
- PRICE
- MARGIN
- NEGOTIATION_POSITION
- WITNESS
- COMPLAINANT
- OFFICER
- COORDINATE
- WAHI_TAPU_REFERENCE

### Legal labels
- LGOIMA_PRIVACY
- LGOIMA_TRADE_SECRET
- LGOIMA_COMMERCIAL_PREJUDICE
- LGOIMA_CONFIDENCE
- LGOIMA_TIKANGA_WAAHI_TAPU
- LGOIMA_PUBLIC_SAFETY_MEASURES
- LGOIMA_MATERIAL_LOSS_PREVENTION
- LGOIMA_FREE_AND_FRANK
- LGOIMA_HARASSMENT
- LGOIMA_LEGAL_PRIVILEGE
- LGOIMA_COUNCIL_COMMERCIAL
- LGOIMA_NEGOTIATIONS
- LGOIMA_IMPROPER_ADVANTAGE
- LGOIMA_SECURITY_OR_INTL
- LGOIMA_CONFIDENTIAL_FOREIGN_INFO
- LGOIMA_MAINTENANCE_OF_LAW
- LGOIMA_SAFETY_OF_PERSON

### Workflow labels
- REVIEW_PUBLIC_INTEREST
- REVIEW_NCND
- ROUTE_PRIVACY_ACT
- REVIEW_TRANSFER
- REVIEW_SECTION16_PARTIAL_RELEASE
- REVIEW_EXCERPT_OR_SUMMARY
- REVIEW_SECTION17_NOT_HELD
- REVIEW_SECTION17_COLLATION
- REVIEW_SECTION17_VEXATIOUS
- ESCALATE_LEGAL

---

## 18. Minimum metadata to store for each redaction recommendation

For auditability, store:

- document ID
- file type
- page / paragraph / cell location
- extracted span
- normalised entity type
- proposed legal ground
- statutory section
- confidence score
- reviewer status
- final decision
- public-interest balancing note
- decision date
- reviewer identity
- release version ID

This becomes crucial if the council needs to:
- defend a decision to the requester
- explain partial withholding
- respond to an Ombudsman complaint
- reproduce the release process later

---

## 19. Suggested test-pack expansion strategy

For a comprehensive benchmark suite, create packs that vary by:
- domain
- complexity
- file type
- OCR quality
- density of sensitive content
- ambiguity
- degree of overlap between grounds

### Pack levels
**Level 1 — clean**
- short files
- obvious entities
- one dominant ground

**Level 2 — realistic**
- mixed grounds
- longer narratives
- emails plus attachments
- spreadsheets and appendices

**Level 3 — difficult**
- scanned PDFs
- handwritten annotations
- repeated people across files
- borderline commercial material
- mixed personal and official roles

**Level 4 — torture test**
- OCR noise
- hidden spreadsheet tabs
- document comments / track changes
- embedded screenshots
- overlapping privilege and free-and-frank analysis
- NCND workflow prompts
- Privacy Act routing prompts

---

## 20. Summary taxonomy table

| Legal label | LGOIMA section | Public-interest balancing? | Typical local government use cases |
|---|---|---:|---|
| privacy | s 7(2)(a) | Yes | Customer files, complaints, housing, dog control, HR |
| trade_secret | s 7(2)(b)(i) | Yes | Specialist supplier methods, proprietary technical info |
| commercial_prejudice | s 7(2)(b)(ii) | Yes | Tenders, bid pricing, supplier commercial data |
| tikanga_maori_wahi_tapu | s 7(2)(ba) | Yes | Resource consent, heritage, GIS, archaeological sites |
| confidence_prejudice_future_supply | s 7(2)(c)(i) | Yes | Complaints, whistleblowing, sensitive submissions |
| confidence_public_interest_damage | s 7(2)(c)(ii) | Yes | Confidential stakeholder or source information |
| public_health_safety_measures | s 7(2)(d) | Yes | Safety controls, water systems, emergency procedures |
| material_loss_prevention | s 7(2)(e) | Yes | Anti-fraud, cyber, revenue protection, security controls |
| free_and_frank | s 7(2)(f)(i) | Yes | Internal advice, drafts, candid commentary |
| harassment_pressure | s 7(2)(f)(ii) | Yes | Staff-facing hostility, contentious enforcement matters |
| legal_privilege | s 7(2)(g) | Yes | Legal advice, litigation, employment disputes |
| council_commercial_activities | s 7(2)(h) | Yes | Council leases, pricing, development economics |
| negotiations | s 7(2)(i) | Yes | Property, employment, supplier, settlement negotiations |
| improper_gain_advantage | s 7(2)(j) | Yes | Tenders, land acquisition, valuation, timing-sensitive info |
| security_or_defence_intl_relations | s 6(a) | No | Rare but possible in critical infrastructure/security matters |
| confidential_foreign_info | s 6(b) | No | Rare overseas/intl confidence material |
| maintenance_of_law | s 6(c) | No | Investigations, prosecutions, enforcement files |
| safety_of_person | s 6(d) | No | Threats, witness safety, protected locations |

---

## 21. Final implementation recommendations

1. **Do not equate detected entities with legal grounds.**  
2. **Treat section 6 and section 7 differently.**  
3. **Force a public-interest review for all section 7 decisions.**  
4. **Support partial release, excerpt release, and summary release.**  
5. **Add workflow labels, not just redaction labels.**  
6. **Use document type and surrounding context heavily.**  
7. **Keep humans firmly in the loop for privilege, safety, NCND, and public-interest balancing.**  
8. **Benchmark across many file types, not just PDFs or Word.**  
9. **Capture audit metadata for each recommendation.**  
10. **Test long, messy, realistic council records, not just tidy exemplars.**

---

## 22. Suggested next deliverables

This markdown file is a taxonomy reference. The most useful follow-on artefacts would be:

1. **A spreadsheet taxonomy**  
   Columns for label, section, definition, indicators, examples, file types, confidence notes, reviewer guidance.

2. **A JSON schema pack**  
   For direct integration into your pipeline or evaluation harness.

3. **A benchmark annotation guide**  
   For human labellers reviewing synthetic or real records.

4. **A gold-standard test corpus**  
   By use case, with expected redaction spans and expected legal labels.

5. **A release-decision template pack**  
   Including reasons, partial-release wording, public-interest note fields, and section references.

---

## 23. Source note

This document is based on the current text of the **Local Government Official Information and Meetings Act 1987** and the New Zealand **Office of the Ombudsman** guidance on LGOIMA processing, the public-interest test, and the conclusive withholding grounds.

Key source areas used:
- LGOIMA sections 5, 6, 7, 8, 10, 13, 15, 16, 17, 17A, 17B
- Ombudsman guidance on:
  - section 6 conclusive grounds
  - public interest balancing under section 7
  - local government agency processing under LGOIMA

For implementation in production, always verify exact section references against the current legislation and any updated Ombudsman guidance before final deployment or legal sign-off.
