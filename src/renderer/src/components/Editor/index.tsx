import CodeEditor from '@renderer/components/CodeEditor'
import { useState } from 'react'

export default function Editor() {
  const [code, setCode] = useState(example)

  return (
    <form>
      <CodeEditor
        value={code}
        onChange={(newCode) => {
          setCode(newCode)
        }}
        extensions={[]}
      />
    </form>
  )
}

const example = `l_french:
 ################################
 # Banished Threat Origin
 ################################
 AAA_origin_banished_threat: "Banished Threat"
 AAA_origin_banished_threat_desc: "Defeated and sealed on their homeworld, this empire has been plotting their revenge for centuries. Only now has the shield started to weaken."
 #AAA_origin_banished_threat_effects: "- Start on a §H$pc_nuked$§! as your capital.\n- Your Guaranteed Habitable Worlds are §Hshielded worlds§! with deteriorating shields."
 AAA_origin_banished_threat_effects: "- $HOMEWORLD$ ['concept_pc_nuked']$NEW_LINE$- $SPECIES_TRAITS$ ['concept_AAA_survivor']$NEW_LINE$- ['concept_guaranteed_colonies']: Sealed behind ['concept_AAA_deteriorating_shields']"
 AAA_origin_banished_threat_machines: "Banished Threat"
 AAA_origin_banished_threat_machines_desc: "Defeated and sealed on their homeworld, this empire has been plotting their revenge for centuries. Only now has the shield started to weaken."
 AAA_origin_banished_threat_machines_effects: "- $HOMEWORLD$ ['concept_pc_nuked']$NEW_LINE$- $SPECIES_TRAITS$ ['concept_AAA_robot_survivor']$NEW_LINE$- ['concept_guaranteed_colonies']: Sealed behind ['concept_AAA_deteriorating_shields']"
 AAA_civic_tooltip_genocidal: "Has a ['concept_genocidal_civics'] Civic"

 banished_threat_start_NAME: "Banished Threat"
 banished_threat_start_DESC: "This will always be the starting system when using the Banished Threat Origin."
 trait_pc_nuked_preference_AAA_banished_threat_dry: "Dry Tomb World Preference"
 trait_pc_nuked_preference_AAA_banished_threat_dry_desc: "§LClimate preference is determined at the genetic level, by skillful manipulation or eons of evolution in complete isolation in said environment.§!"
 trait_pc_nuked_preference_AAA_banished_threat_wet: "Wet Tomb World Preference"
 trait_pc_nuked_preference_AAA_banished_threat_wet_desc: "§LClimate preference is determined at the genetic level, by skillful manipulation or eons of evolution in complete isolation in said environment.§!"
 trait_pc_nuked_preference_AAA_banished_threat_cold: "Cold Tomb World Preference"
 trait_pc_nuked_preference_AAA_banished_threat_cold_desc: "§LClimate preference is determined at the genetic level, by skillful manipulation or eons of evolution in complete isolation in said environment.§!"

 AAA_trait_ancient_organism: "Ancient Organism"
 AAA_trait_ancient_organism_desc: "This species hail from a time long before the current generations of spacefaring empires."
 AAA_trait_ancient_configuration: "Ancient Configuration"
 AAA_trait_ancient_configuration_desc: "These machines were built by an ancient precursor species long before any of the current generations of spacefaring empires even evolved basic sapience."

# shielded planet special projects
 BANISHED_SHIELD_CAT: "Deteriorating Shield"
 BANISHED_SHIELD_CAT_FAIL: "Deteriorating Shield"
 DETERIORATING_SHIELD_DESC: "This planet is encased in some kind of impenetrable shield."
 SHIELDED_PLANET_PROJECT_NAME: "Deteriorating Shield"
 SHIELDED_PLANET_PROJECT_DESC: "[From.GetName]'s shield appears to be deteriorating. We could try to bring it down."
 SHIELDED_PLANET_PROJECT_THREAT_DESC: "[From.planet.GetName]'s shield appears to be deteriorating, just like the one encasing our world. Taking it down should be easy."
 TAKE_IT_DOWN: "Take it down."
 TAKE_IT_DOWN_TOOLTIP: "We will try to breach the shield."
 LEAVE_IT: "Leave it."
 LEAVE_IT_TOOLTIP: "The planet must have been isolated from the wider galaxy for a reason. Better safe than sorry."
 AAA_TAKE_DOWN_BANISHED_SHIELD: "Take down deteriorating shield."
 AAA_TAKE_DOWN_BANISHED_SHIELD_FAIL: "Take down deteriorating shield."
 AAA_TAKE_DOWN_BANISHED_SHIELD_FAIL_DESC: "Take down deteriorating shield."

# old shield down messages
 SHIELD_DOWN_NAME: "Shield Down"
 SHIELD_DOWN_DESC: "We did it! The shield is now down. The planet looks like its one of our old core worlds, although all that remains of its past settlements are a few ruins."
 SHIELD_DOWN_NON_THREAT_DESC: "We did it! The shield is now down. The planet looks like it was once a colony of an ancient empire, although all that remains of its past settlements are a few ruins."
 SHIELD_DOWN_BARREN_THREAT: "We did it! The shield is now down. The planet, however, was revealed to be a barren wasteland."
 SHIELD_DOWN_SHATTERED_THREAT: "We did it! The shield is now down. The planet, however, appears to be the shattered remnants of one of our core worlds. There's nothing left now."
 SHIELD_DOWN_TERRAFORMING_THREAT: "We did it! The shield is now down. The planet, however, was a barren world. We could, with great effort, restore its ecosystem."
 SHIELD_DOWN_BARREN: "We did it! The shield is now down. The planet, however, was revealed to be a barren world. It appears to have been encased by the shield for roughly 9 million years before we brought it down."
 SHIELD_DOWN_SHATTERED: "We did it! The shield is now down. The planet, however, appears to be the shattered remnants of a world that had been used by an empire roughly 9 million years ago."
 SHIELD_DOWN_TERRAFORMING: "We did it! The shield is now down. The planet, however, was a barren world. We could, with great effort, restore its ecosystem."
# new shield down messages
 AAA.2.desc: "We did it! The shield is now down!"
 AAA.2.a: "The planet, however, was revealed to be a barren wasteland."
 AAA.2.b: "The planet, however, appears to be the shattered remnants of one of our core worlds. There's nothing left now."
 AAA.2.b.nonthreat: "The planet, however, appears to be the shattered remnants of an ancient core world. There's nothing left now."
 AAA.2.c: "The planet looks like its one of our old core worlds."
 AAA.2.c.nonthreat: "The planet looks like it was once a colony of an ancient empire."
 AAA.2.d: "A lot of our old infrastructure seems to have survived the long time in isolation."
 AAA.2.d.nonthreat: "A lot of its former inhabitants old infrastructure seems to have survived the long time in isolation."
 AAA.2.e: "The planet, however, does not seem like it is beyond saving, and we could theoretically restore its ecosystem with a big enough investment."

 AAA_origin.2150.name: "Old Friends"
 AAA_origin.2150.desc: "While our own shield was sufficiently damaged to crack on its own, the other colonies in our capital system seems to not have been so lucky. Still, the lack of maintenance has been catastrophic for their integrity."
 AAA_origin.2150.a: "We will take back what is ours."
 AAA_origin.2150.a.tooltip: "We will prepare special projects to free our former colonies."
 AAA_origin.2150.b: "It is not worth expending resources on them."

 AAA_TAKE_DOWN_BANISHED_SHIELD_VENUS: "Deteriorating Shield"
 AAA_TAKE_DOWN_BANISHED_SHIELD_VENUS_DESC: "The energy barrier that has encapsulated Venus has deteriorated during the eons. We could try to bring it down."

 AAA_TAKE_DOWN_BANISHED_SHIELD_MARS: "Deteriorating Shield"
 AAA_TAKE_DOWN_BANISHED_SHIELD_MARS_DESC: "The energy barrier that has encapsulated Mars has deteriorated during the eons. We could try to bring it down."

 AAA_origin.2151.name: "Shield Down"
 AAA_origin.2151.desc: "We have have managed to take down the shield around [FromFrom.GetName]. The toxic hellscape underneath might not be the most inviting home, but with enough technological progress it should be possible to return it to its former glory."
 AAA_origin.2151.a: "Not Too Shabby."
 AAA_origin.2151.a.tooltip: "[FromFrom.GetName] has been revealed to be a toxic world that could potentially be terraformed."

 AAA_origin.2152.name: "Shield Down"
 AAA_origin.2152.desc: "We have have managed to take down the shield around [FromFrom.GetName]. The barren wasteland underneath might not be the verdant paradise we remember, but returning it to its former glory shouldn't be too great of a task to overcome."
 AAA_origin.2152.a: "[FromFrom.GetName] will be restored."
 AAA_origin.2152.a.tooltip: "[FromFrom.GetName] has been revealed to be a barren world that could be terraformed once we obtain the necessary technologies."`
